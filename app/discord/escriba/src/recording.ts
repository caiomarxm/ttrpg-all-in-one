import opus from "@discordjs/opus";
import * as Eris from "eris";

const { OpusEncoder } = opus;
import { speakerWavPath, writeSpeakerWav } from "./wav.js";
import type { TaskPublisher } from "./celery-publisher.js";

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
  pcmChunks: Buffer[];
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
  private readonly speakers = new Map<string, SpeakerState>();
  private readonly decoders = new Map<string, InstanceType<typeof OpusEncoder>>();

  constructor(
    private readonly client: DiscordClientLike,
    private readonly sessionId: string,
    private readonly recordingsDir: string,
    private readonly taskPublisher: TaskPublisher | null,
    private readonly ignoredUserIds: ReadonlySet<string> = new Set(),
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

    await this.flushWavs();
    await this.taskPublisher?.publishTranscribeSession(this.sessionId);
  }

  private onData = (data: Buffer, userId: string): void => {
    if (!userId || isMostlyZeroPacket(data) || this.ignoredUserIds.has(userId)) {
      return;
    }

    void this.appendPacket(userId, data);
  };

  private async appendPacket(userId: string, data: Buffer): Promise<void> {
    let speaker = this.speakers.get(userId);
    if (!speaker) {
      speaker = {
        username: await this.resolveUsername(userId),
        pcmChunks: [],
      };
      this.speakers.set(userId, speaker);
    }

    let decoder = this.decoders.get(userId);
    if (!decoder) {
      decoder = new OpusEncoder(48_000, 2);
      this.decoders.set(userId, decoder);
    }

    try {
      speaker.pcmChunks.push(decoder.decode(data));
    } catch (err: unknown) {
      console.warn(
        `[recording] failed to decode opus for userId=${userId}`,
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

  private async flushWavs(): Promise<void> {
    const writes = [...this.speakers.entries()].map(([userId, speaker]) =>
      writeSpeakerWav(
        speakerWavPath(
          this.recordingsDir,
          this.sessionId,
          userId,
          speaker.username,
        ),
        speaker.pcmChunks,
      ),
    );

    await Promise.all(writes);
    this.speakers.clear();
    this.decoders.clear();
  }
}
