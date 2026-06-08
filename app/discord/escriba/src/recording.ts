import { rename, rm } from "node:fs/promises";
import path from "node:path";
import { once } from "node:events";
import type { WriteStream } from "node:fs";
import { finished } from "node:stream/promises";
import opus from "@discordjs/opus";
import * as Eris from "eris";

const { OpusEncoder } = opus;
import {
  openSpeakerWavStream,
  patchWavHeader,
  speakerWavPath,
  WAV_BIT_DEPTH,
  WAV_CHANNELS,
  WAV_SAMPLE_RATE,
} from "./wav.js";
import type { TranscriptionNotifier } from "./transcription-client.js";
import {
  pcmBytesPerSecond,
  SESSION_MANIFEST_VERSION,
  type SpeakingBurst,
  type SpeakerManifestEntry,
  writeSessionManifest,
} from "./session-manifest.js";

export type DiscordClientLike = Pick<
  Eris.Client,
  | "getChannel"
  | "getRESTChannel"
  | "guilds"
  | "closeVoiceConnection"
  | "leaveVoiceChannel"
> & {
  channelGuildMap: Eris.Client["channelGuildMap"];
};

type JoinableVoiceChannel = {
  id: string;
  guild: { id: string };
  join: (options?: { opusOnly?: boolean }) => Promise<Eris.VoiceConnection>;
  leave: () => void;
};

type SpeakerState = {
  username: string;
  filePath: string;
  stream: WriteStream;
  speakingBursts: SpeakingBurst[];
  currentBurstIndex: number;
  totalPcmBytes: number;
  lastPacketAtMs: number;
};

function asJoinableVoiceChannel(
  channel: Eris.AnyChannel | undefined,
): JoinableVoiceChannel | null {
  if (!channel || !("guild" in channel)) {
    return null;
  }

  const candidate = channel as JoinableVoiceChannel;
  if (
    typeof candidate.join !== "function" ||
    typeof candidate.leave !== "function"
  ) {
    return null;
  }

  return candidate;
}

async function resolveJoinableVoiceChannel(
  client: DiscordClientLike,
  guildId: string,
  channelId: string,
): Promise<JoinableVoiceChannel> {
  const cached = asJoinableVoiceChannel(client.getChannel(channelId));
  if (cached) {
    return cached;
  }

  if (!client.guilds.get(guildId)) {
    throw new Error(
      `Guild not found: ${guildId}. Invite O Escriba to this Discord server.`,
    );
  }

  const fetched = await client.getRESTChannel(channelId);
  const channel = asJoinableVoiceChannel(fetched);
  if (!channel) {
    throw new Error(`Voice channel not found: ${channelId}`);
  }

  if (channel.guild.id !== guildId) {
    throw new Error(
      `Channel ${channelId} is not in guild ${guildId} (got ${channel.guild.id})`,
    );
  }

  const guild = client.guilds.get(guildId);
  if (guild) {
    guild.channels.add(
      fetched as Eris.AnyGuildChannel,
      client as Eris.Client,
    );
    client.channelGuildMap[channelId] = guildId;
  }

  return channel;
}

export function isMostlyZeroPacket(data: Buffer): boolean {
  if (data.length === 0 || data[0] !== 0) {
    return false;
  }

  let zeroCount = 0;
  for (const byte of data) {
    if (byte === 0) {
      zeroCount += 1;
    }
  }

  return zeroCount >= data.length - 1;
}

function sanitizeUsername(username: string): string {
  return username.replace(/[^\w.-]+/g, "_") || "unknown";
}

type VoiceConnectionLike = {
  receive: (type: string) => Eris.VoiceDataStream;
  disconnect: () => void;
};

export class Recording {
  private connection: VoiceConnectionLike | null = null;
  private receiver: Eris.VoiceDataStream | null = null;
  private channel: JoinableVoiceChannel | null = null;
  private guildId: string | null = null;
  private channelId: string | null = null;
  private joined = false;
  private finalized = false;
  private readonly speakers = new Map<string, SpeakerState>();
  private readonly decoders = new Map<string, InstanceType<typeof OpusEncoder>>();
  private sessionStartedAtMs: number | null = null;

  constructor(
    private readonly client: DiscordClientLike,
    private readonly sessionId: string,
    private readonly recordingsDir: string,
    private readonly transcriptionNotifier: TranscriptionNotifier | null,
    private readonly ignoredUserIds: ReadonlySet<string> = new Set(),
    private readonly silenceGapMs = 2000,
  ) {}

  get isJoined(): boolean {
    return this.joined;
  }

  async join(guildId: string, channelId: string): Promise<void> {
    if (this.joined) {
      return;
    }

    const channel = await resolveJoinableVoiceChannel(
      this.client,
      guildId,
      channelId,
    );

    const connection = await channel.join({ opusOnly: true });
    const receiver = connection.receive("opus");
    receiver.on("data", this.onData);

    this.channel = channel;
    this.connection = connection as VoiceConnectionLike;
    this.receiver = receiver;
    this.guildId = guildId;
    this.channelId = channelId;
    this.joined = true;
    this.sessionStartedAtMs = Date.now();
  }

  async stop(): Promise<void> {
    if (!this.joined) {
      return;
    }

    const guildId = this.guildId;
    const channelId = this.channelId;
    const connection = this.connection;

    this.receiver?.removeListener("data", this.onData);
    this.receiver = null;
    this.joined = false;

    connection?.disconnect();
    this.connection = null;

    if (guildId) {
      this.client.closeVoiceConnection(guildId);
    } else if (channelId && this.client.channelGuildMap[channelId]) {
      this.client.leaveVoiceChannel(channelId);
    } else {
      this.channel?.leave();
    }

    this.channel = null;
    this.guildId = null;
    this.channelId = null;
  }

  async discard(): Promise<void> {
    if (this.finalized) {
      return;
    }
    this.finalized = true;

    await this.stop();
    this.abandonOpenStreams();

    const sessionDir = path.join(this.recordingsDir, this.sessionId);
    await rm(sessionDir, { recursive: true, force: true });
  }

  async finalize(): Promise<void> {
    if (this.finalized) {
      return;
    }
    this.finalized = true;

    let wavPaths: string[];
    try {
      wavPaths = await this.finalizeWavs();
    } catch (err: unknown) {
      console.error(
        `[recording] finalize failed sessionId=${this.sessionId}`,
        err,
      );
      return;
    }

    if (!this.transcriptionNotifier) {
      return;
    }

    try {
      await this.transcriptionNotifier.notifyTranscriptionReady(
        this.sessionId,
        wavPaths,
      );
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(
        "[recording] transcription notify failed; WAV files retained for manual recovery",
        {
          sessionId: this.sessionId,
          wavPaths,
          error: message,
        },
      );
    }
  }

  private onData = (data: Buffer, userId: string): void => {
    if (!userId || isMostlyZeroPacket(data) || this.ignoredUserIds.has(userId)) {
      return;
    }

    void this.appendPacket(userId, data);
  };

  private async appendPacket(userId: string, data: Buffer): Promise<void> {
    let speaker = this.speakers.get(userId);
    const isNewSpeaker = !speaker;
    if (!speaker) {
      const placeholderUsername = sanitizeUsername(userId);
      const filePath = speakerWavPath(
        this.recordingsDir,
        this.sessionId,
        userId,
        placeholderUsername,
      );
      speaker = {
        username: placeholderUsername,
        filePath,
        stream: openSpeakerWavStream(filePath),
        speakingBursts: [],
        currentBurstIndex: -1,
        totalPcmBytes: 0,
        lastPacketAtMs: 0,
      };
      this.speakers.set(userId, speaker);
    }

    let decoder = this.decoders.get(userId);
    if (!decoder) {
      decoder = new OpusEncoder(48_000, 2);
      this.decoders.set(userId, decoder);
    }

    if (isNewSpeaker) {
      void this.resolveUsername(userId).then((username) => {
        this.updateSpeakerUsername(userId, username);
      });
    }

    try {
      const pcm = decoder.decode(data);
      this.recordPcmPacket(speaker, pcm.length);
      const ok = speaker.stream.write(pcm);
      if (!ok) {
        await once(speaker.stream, "drain");
      }
    } catch (err: unknown) {
      console.warn(
        `[recording] failed to decode opus for userId=${userId}`,
        err,
      );
    }
  }

  private recordPcmPacket(speaker: SpeakerState, pcmLength: number): void {
    const nowMs = Date.now();
    const sessionOffsetMs =
      this.sessionStartedAtMs !== null ? nowMs - this.sessionStartedAtMs : 0;

    if (speaker.speakingBursts.length === 0) {
      speaker.speakingBursts.push({
        session_offset_ms: sessionOffsetMs,
        wav_offset_bytes: speaker.totalPcmBytes,
        pcm_bytes: 0,
      });
      speaker.currentBurstIndex = 0;
    } else if (
      speaker.lastPacketAtMs > 0 &&
      nowMs - speaker.lastPacketAtMs > this.silenceGapMs
    ) {
      speaker.speakingBursts.push({
        session_offset_ms: sessionOffsetMs,
        wav_offset_bytes: speaker.totalPcmBytes,
        pcm_bytes: 0,
      });
      speaker.currentBurstIndex = speaker.speakingBursts.length - 1;
    }

    const burst = speaker.speakingBursts[speaker.currentBurstIndex]!;
    burst.pcm_bytes += pcmLength;
    speaker.totalPcmBytes += pcmLength;
    speaker.lastPacketAtMs = nowMs;
  }

  private updateSpeakerUsername(userId: string, username: string): void {
    const speaker = this.speakers.get(userId);
    if (!speaker || speaker.username === username) {
      return;
    }

    speaker.username = username;
  }

  private async ensureSpeakerFilePath(
    userId: string,
    speaker: SpeakerState,
  ): Promise<void> {
    const targetPath = speakerWavPath(
      this.recordingsDir,
      this.sessionId,
      userId,
      speaker.username,
    );
    if (targetPath === speaker.filePath) {
      return;
    }

    try {
      await rename(speaker.filePath, targetPath);
      speaker.filePath = targetPath;
    } catch (err: unknown) {
      console.warn(
        `[recording] failed to rename wav for userId=${userId}`,
        err,
      );
    }
  }

  private async resolveUsername(userId: string): Promise<string> {
    const channel = this.channel;
    if (!channel || !("guild" in channel)) {
      return "unknown";
    }

    const guildChannel = channel as JoinableVoiceChannel & {
      guild: Eris.Guild;
      voiceMembers?: Eris.Collection<Eris.Member>;
    };

    const fetched =
      typeof guildChannel.guild.fetchMembers === "function"
        ? await guildChannel.guild
            .fetchMembers({ userIDs: [userId] })
            .catch(() => undefined)
        : undefined;

    const member = guildChannel.voiceMembers?.get(userId) ?? fetched?.[0];

    if (member?.username) {
      return sanitizeUsername(member.username);
    }

    return sanitizeUsername(userId);
  }

  private abandonOpenStreams(): void {
    for (const speaker of this.speakers.values()) {
      speaker.stream.destroy();
    }
    this.speakers.clear();
    this.decoders.clear();
  }

  private async finalizeWavs(): Promise<string[]> {
    const speakers = [...this.speakers.entries()];
    const wavPaths = await Promise.all(
      speakers.map(async ([userId, speaker]) => {
        speaker.stream.end();
        await finished(speaker.stream);
        await this.ensureSpeakerFilePath(userId, speaker);
        await patchWavHeader(speaker.filePath);
        return speaker.filePath;
      }),
    );

    if (this.sessionStartedAtMs !== null && speakers.length > 0) {
      const sessionDir = path.join(this.recordingsDir, this.sessionId);
      const speakerEntries: Record<string, SpeakerManifestEntry> = {};

      for (const [userId, speaker] of speakers) {
        speakerEntries[userId] = {
          user_id: userId,
          username: speaker.username,
          wav_file: path.basename(speaker.filePath),
          speaking_bursts: speaker.speakingBursts,
        };
      }

      await writeSessionManifest(sessionDir, {
        version: SESSION_MANIFEST_VERSION,
        session_id: this.sessionId,
        session_started_at_ms: this.sessionStartedAtMs,
        audio: {
          sample_rate: WAV_SAMPLE_RATE,
          channels: WAV_CHANNELS,
          bit_depth: WAV_BIT_DEPTH,
          bytes_per_second: pcmBytesPerSecond(),
        },
        speakers: speakerEntries,
      });
    }

    this.speakers.clear();
    this.decoders.clear();
    return wavPaths;
  }
}
