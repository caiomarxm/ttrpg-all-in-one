import { mkdtemp, readdir, readFile, rm, stat } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import opus from "@discordjs/opus";
import type { TranscriptionNotifier } from "../transcription-client.js";
import { MANIFEST_FILENAME } from "../session-manifest.js";
import { WAV_HEADER_SIZE } from "../wav.js";
import {
  Recording,
  isMostlyZeroPacket,
  type DiscordClientLike,
} from "../recording.js";

const { OpusEncoder } = opus;

const decode = vi.fn((packet: Buffer) => Buffer.alloc(1920, packet[0] ?? 0));

vi.mock("@discordjs/opus", () => ({
  default: {
    OpusEncoder: vi.fn().mockImplementation(() => ({ decode })),
  },
}));

function createMockVoiceSetup() {
  const receiver = {
    on: vi.fn(),
    removeListener: vi.fn(),
  };

  const connection = {
    receive: vi.fn().mockReturnValue(receiver),
    disconnect: vi.fn(),
  };

  const channel = {
    id: "channel-1",
    guild: { id: "guild-1" },
    join: vi.fn().mockResolvedValue(connection),
    leave: vi.fn(),
  };

  const guild = {
    channels: { add: vi.fn() },
  };

  const client: DiscordClientLike = {
    getChannel: vi.fn().mockReturnValue(channel),
    getRESTChannel: vi.fn(),
    guilds: { get: vi.fn().mockReturnValue(guild) } as unknown as DiscordClientLike["guilds"],
    channelGuildMap: {},
    closeVoiceConnection: vi.fn(),
    leaveVoiceChannel: vi.fn(),
  };

  return { client, channel, connection, receiver, guild };
}

describe("isMostlyZeroPacket", () => {
  it("skips packets that are almost all zeros", () => {
    expect(isMostlyZeroPacket(Buffer.from([0, 0, 0, 1]))).toBe(true);
    expect(isMostlyZeroPacket(Buffer.from([1, 2, 3, 4]))).toBe(false);
  });
});

describe("Recording", () => {
  let tempDir = "";
  let notifyTranscriptionReady: ReturnType<typeof vi.fn>;
  let transcriptionNotifier: TranscriptionNotifier;

  beforeEach(() => {
    vi.clearAllMocks();
    notifyTranscriptionReady = vi.fn().mockResolvedValue(undefined);
    transcriptionNotifier = {
      notifyTranscriptionReady,
      close: vi.fn(),
    };
  });

  afterEach(async () => {
    if (tempDir) {
      await rm(tempDir, { recursive: true, force: true });
      tempDir = "";
    }
  });

  it("join registers opus receiver and marks joined", async () => {
    const { client, channel, connection, receiver } = createMockVoiceSetup();
    const recording = new Recording(
      client,
      "session-1",
      "/tmp/recordings",
      transcriptionNotifier,
    );

    await recording.join("guild-1", "channel-1");

    expect(channel.join).toHaveBeenCalledWith({ opusOnly: true });
    expect(connection.receive).toHaveBeenCalledWith("opus");
    expect(receiver.on).toHaveBeenCalledWith("data", expect.any(Function));
    expect(recording.isJoined).toBe(true);
  });

  it("fetches voice channel via REST when it is not cached", async () => {
    const { client, channel, connection, receiver, guild } =
      createMockVoiceSetup();
    client.getChannel = vi.fn().mockReturnValue(undefined);
    client.getRESTChannel = vi.fn().mockResolvedValue(channel);

    const recording = new Recording(
      client,
      "session-1",
      "/tmp/recordings",
      transcriptionNotifier,
    );

    await recording.join("guild-1", "channel-1");

    expect(client.getRESTChannel).toHaveBeenCalledWith("channel-1");
    expect(guild.channels.add).toHaveBeenCalledWith(channel, client);
    expect(client.channelGuildMap["channel-1"]).toBe("guild-1");
    expect(channel.join).toHaveBeenCalledWith({ opusOnly: true });
    expect(connection.receive).toHaveBeenCalledWith("opus");
    expect(receiver.on).toHaveBeenCalled();
  });

  it("duplicate join is a no-op", async () => {
    const { client, channel } = createMockVoiceSetup();
    const recording = new Recording(
      client,
      "session-1",
      "/tmp/recordings",
      transcriptionNotifier,
    );

    await recording.join("guild-1", "channel-1");
    await recording.join("guild-1", "channel-1");

    expect(channel.join).toHaveBeenCalledTimes(1);
  });

  it("stop leaves voice immediately without finalizing WAVs or publishing", async () => {
    tempDir = await mkdtemp(path.join(os.tmpdir(), "escriba-rec-"));
    const { client, connection, receiver } = createMockVoiceSetup();
    const recording = new Recording(
      client,
      "session-1",
      tempDir,
      transcriptionNotifier,
    );

    await recording.join("guild-1", "channel-1");

    const onData = receiver.on.mock.calls[0][1] as (
      data: Buffer,
      userId: string,
    ) => void;
    onData(Buffer.from([1, 2, 3, 4]), "user-1");
    await new Promise((resolve) => setTimeout(resolve, 0));

    await recording.stop();

    expect(connection.disconnect).toHaveBeenCalledTimes(1);
    expect(client.closeVoiceConnection).toHaveBeenCalledWith("guild-1");
    expect(recording.isJoined).toBe(false);
    expect(notifyTranscriptionReady).not.toHaveBeenCalled();

    const files = await readdir(path.join(tempDir, "session-1"));
    expect(files.some((name) => name.startsWith("user-1_"))).toBe(true);
  });

  it("discard leaves voice, deletes recordings, and does not publish", async () => {
    tempDir = await mkdtemp(path.join(os.tmpdir(), "escriba-rec-"));
    const { client, connection, receiver } = createMockVoiceSetup();
    const recording = new Recording(
      client,
      "session-1",
      tempDir,
      transcriptionNotifier,
    );

    await recording.join("guild-1", "channel-1");

    const onData = receiver.on.mock.calls[0][1] as (
      data: Buffer,
      userId: string,
    ) => void;
    onData(Buffer.from([1, 2, 3, 4]), "user-1");
    await new Promise((resolve) => setTimeout(resolve, 0));

    await recording.discard();

    expect(connection.disconnect).toHaveBeenCalledTimes(1);
    expect(client.closeVoiceConnection).toHaveBeenCalledWith("guild-1");
    expect(recording.isJoined).toBe(false);
    expect(notifyTranscriptionReady).not.toHaveBeenCalled();

    await expect(stat(path.join(tempDir, "session-1"))).rejects.toThrow();
  });

  it("finalize writes WAV files and notifies transcription API", async () => {
    tempDir = await mkdtemp(path.join(os.tmpdir(), "escriba-rec-"));
    const { client, receiver } = createMockVoiceSetup();
    const recording = new Recording(
      client,
      "session-1",
      tempDir,
      transcriptionNotifier,
    );

    await recording.join("guild-1", "channel-1");

    const onData = receiver.on.mock.calls[0][1] as (
      data: Buffer,
      userId: string,
    ) => void;
    onData(Buffer.from([1, 2, 3, 4]), "user-1");
    onData(Buffer.from([0, 0, 0, 0]), "user-1");
    await new Promise((resolve) => setTimeout(resolve, 0));

    await recording.stop();
    await recording.finalize();

    expect(decode).toHaveBeenCalledTimes(1);
    expect(notifyTranscriptionReady).toHaveBeenCalledWith(
      "session-1",
      expect.arrayContaining([expect.stringMatching(/user-1_.*\.wav$/)]),
    );

    const files = await readdir(path.join(tempDir, "session-1"));
    expect(files.some((name) => name.startsWith("user-1_"))).toBe(true);
    expect(files.some((name) => name.endsWith(".wav"))).toBe(true);
  });

  it("finalize with null transcriptionNotifier writes WAVs and skips notify", async () => {
    tempDir = await mkdtemp(path.join(os.tmpdir(), "escriba-rec-"));
    const { client, receiver } = createMockVoiceSetup();
    const recording = new Recording(client, "session-1", tempDir, null);

    await recording.join("guild-1", "channel-1");

    const onData = receiver.on.mock.calls[0][1] as (
      data: Buffer,
      userId: string,
    ) => void;
    onData(Buffer.from([1, 2, 3, 4]), "user-1");
    await new Promise((resolve) => setTimeout(resolve, 0));

    await recording.stop();
    await expect(recording.finalize()).resolves.toBeUndefined();

    expect(notifyTranscriptionReady).not.toHaveBeenCalled();

    const files = await readdir(path.join(tempDir, "session-1"));
    expect(files.some((name) => name.endsWith(".wav"))).toBe(true);
  });

  it("finalize logs and does not throw when publish fails", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    notifyTranscriptionReady.mockRejectedValue(new Error("api down"));

    tempDir = await mkdtemp(path.join(os.tmpdir(), "escriba-rec-"));
    const { client, receiver } = createMockVoiceSetup();
    const recording = new Recording(
      client,
      "session-1",
      tempDir,
      transcriptionNotifier,
    );

    await recording.join("guild-1", "channel-1");

    const onData = receiver.on.mock.calls[0][1] as (
      data: Buffer,
      userId: string,
    ) => void;
    onData(Buffer.from([1, 2, 3, 4]), "user-1");
    await new Promise((resolve) => setTimeout(resolve, 0));

    await recording.stop();
    await expect(recording.finalize()).resolves.toBeUndefined();

    expect(errorSpy).toHaveBeenCalledWith(
      "[recording] transcription notify failed; WAV files retained for manual recovery",
      expect.objectContaining({
        sessionId: "session-1",
        wavPaths: expect.arrayContaining([
          expect.stringMatching(/user-1_.*\.wav$/),
        ]),
        error: "api down",
      }),
    );

    errorSpy.mockRestore();
  });

  it("finalize is idempotent", async () => {
    tempDir = await mkdtemp(path.join(os.tmpdir(), "escriba-rec-"));
    const { client, receiver } = createMockVoiceSetup();
    const recording = new Recording(
      client,
      "session-1",
      tempDir,
      transcriptionNotifier,
    );

    await recording.join("guild-1", "channel-1");

    const onData = receiver.on.mock.calls[0][1] as (
      data: Buffer,
      userId: string,
    ) => void;
    onData(Buffer.from([1, 2, 3, 4]), "user-1");
    await new Promise((resolve) => setTimeout(resolve, 0));

    await recording.stop();
    await recording.finalize();
    await recording.finalize();

    expect(notifyTranscriptionReady).toHaveBeenCalledTimes(1);
  });

  it("ignored user packets are dropped and produce no WAV file", async () => {
    tempDir = await mkdtemp(path.join(os.tmpdir(), "escriba-rec-"));
    const { client, receiver } = createMockVoiceSetup();
    const recording = new Recording(
      client,
      "session-1",
      tempDir,
      transcriptionNotifier,
      new Set(["ignored-user"]),
    );

    await recording.join("guild-1", "channel-1");

    const onData = receiver.on.mock.calls[0][1] as (
      data: Buffer,
      userId: string,
    ) => void;
    onData(Buffer.from([1, 2, 3, 4]), "ignored-user");
    await new Promise((resolve) => setTimeout(resolve, 0));

    await recording.stop();
    await recording.finalize();

    const files = await readdir(path.join(tempDir, "session-1")).catch(
      () => [] as string[],
    );
    expect(files.some((name) => name.startsWith("ignored-user_"))).toBe(false);
    expect(decode).not.toHaveBeenCalled();
  });

  it("concurrent packets for the same user share one speaker state", async () => {
    tempDir = await mkdtemp(path.join(os.tmpdir(), "escriba-rec-"));
    const { client, receiver, channel } = createMockVoiceSetup();

    let unblockFetch!: () => void;
    const fetchBlocked = new Promise<void>((resolve) => {
      unblockFetch = resolve;
    });

    const guildWithSlowFetch = {
      id: "guild-1",
      fetchMembers: vi.fn().mockImplementation(async () => {
        await fetchBlocked;
        return [{ username: "Alice" }];
      }),
    };
    Object.assign(channel, {
      guild: guildWithSlowFetch,
      voiceMembers: { get: vi.fn().mockReturnValue(undefined) },
    });

    const recording = new Recording(
      client,
      "session-1",
      tempDir,
      transcriptionNotifier,
    );

    await recording.join("guild-1", "channel-1");

    const onData = receiver.on.mock.calls[0][1] as (
      data: Buffer,
      userId: string,
    ) => void;

    for (let i = 1; i <= 10; i += 1) {
      onData(Buffer.from([i]), "user-1");
    }

    unblockFetch();
    await new Promise((resolve) => setTimeout(resolve, 0));

    await recording.stop();
    await recording.finalize();

    expect(vi.mocked(OpusEncoder)).toHaveBeenCalledTimes(1);
    expect(decode).toHaveBeenCalledTimes(10);

    const files = await readdir(path.join(tempDir, "session-1"));
    expect(files).toEqual(
      expect.arrayContaining(["user-1_Alice.wav", "session_manifest.json"]),
    );
    expect(files).toHaveLength(2);
  });

  it("stop without join is a no-op", async () => {
    const { client, channel } = createMockVoiceSetup();
    const recording = new Recording(
      client,
      "session-1",
      "/tmp/recordings",
      transcriptionNotifier,
    );

    await recording.stop();

    expect(channel.leave).not.toHaveBeenCalled();
    expect(notifyTranscriptionReady).not.toHaveBeenCalled();
  });

  it("writes PCM to disk incrementally before finalize", async () => {
    tempDir = await mkdtemp(path.join(os.tmpdir(), "escriba-rec-"));
    const { client, receiver } = createMockVoiceSetup();
    const recording = new Recording(
      client,
      "session-1",
      tempDir,
      transcriptionNotifier,
    );

    await recording.join("guild-1", "channel-1");

    const onData = receiver.on.mock.calls[0][1] as (
      data: Buffer,
      userId: string,
    ) => void;
    onData(Buffer.from([1]), "user-1");
    await new Promise((resolve) => setTimeout(resolve, 0));

    const sessionDir = path.join(tempDir, "session-1");
    const filesAfterFirst = await readdir(sessionDir);
    expect(filesAfterFirst).toHaveLength(1);

    const sizeAfterFirst = (await stat(path.join(sessionDir, filesAfterFirst[0]!)))
      .size;
    expect(sizeAfterFirst).toBe(WAV_HEADER_SIZE + 1920);

    onData(Buffer.from([2]), "user-1");
    await new Promise((resolve) => setTimeout(resolve, 0));

    const sizeAfterSecond = (await stat(path.join(sessionDir, filesAfterFirst[0]!)))
      .size;
    expect(sizeAfterSecond).toBe(WAV_HEADER_SIZE + 1920 * 2);
  });

  it("finalize produces a valid WAV header", async () => {
    tempDir = await mkdtemp(path.join(os.tmpdir(), "escriba-rec-"));
    const { client, receiver } = createMockVoiceSetup();
    const recording = new Recording(
      client,
      "session-1",
      tempDir,
      transcriptionNotifier,
    );

    await recording.join("guild-1", "channel-1");

    const onData = receiver.on.mock.calls[0][1] as (
      data: Buffer,
      userId: string,
    ) => void;
    onData(Buffer.from([1, 2, 3, 4]), "user-1");
    await new Promise((resolve) => setTimeout(resolve, 0));

    await recording.stop();
    await recording.finalize();

    const files = await readdir(path.join(tempDir, "session-1"));
    const wavFile = files.find((name) => name.endsWith(".wav"));
    expect(wavFile).toBeDefined();
    const wav = await readFile(path.join(tempDir, "session-1", wavFile!));

    expect(wav.toString("ascii", 0, 4)).toBe("RIFF");
    expect(wav.toString("ascii", 8, 12)).toBe("WAVE");
    expect(wav.readUInt32LE(4)).toBe(36 + 1920);
    expect(wav.readUInt32LE(40)).toBe(1920);
    expect(wav.length).toBe(WAV_HEADER_SIZE + 1920);
  });

  it("partial recording can be recovered by patching the WAV header", async () => {
    tempDir = await mkdtemp(path.join(os.tmpdir(), "escriba-rec-"));
    const { client, receiver } = createMockVoiceSetup();
    const recording = new Recording(
      client,
      "session-1",
      tempDir,
      transcriptionNotifier,
    );

    await recording.join("guild-1", "channel-1");

    const onData = receiver.on.mock.calls[0][1] as (
      data: Buffer,
      userId: string,
    ) => void;
    onData(Buffer.from([1]), "user-1");
    onData(Buffer.from([2]), "user-1");
    await new Promise((resolve) => setTimeout(resolve, 0));

    await recording.stop();

    const { patchWavHeader } = await import("../wav.js");
    const files = await readdir(path.join(tempDir, "session-1"));
    const filePath = path.join(tempDir, "session-1", files[0]!);
    await patchWavHeader(filePath);

    const wav = await readFile(filePath);
    expect(wav.toString("ascii", 0, 4)).toBe("RIFF");
    expect(wav.readUInt32LE(4)).toBe(36 + 1920 * 2);
    expect(wav.readUInt32LE(40)).toBe(1920 * 2);
    expect(wav.length).toBe(WAV_HEADER_SIZE + 1920 * 2);
  });

  describe("Speaking burst manifest", () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it("anchors session clock on join and writes manifest on finalize", async () => {
      tempDir = await mkdtemp(path.join(os.tmpdir(), "escriba-rec-"));
      const { client, receiver } = createMockVoiceSetup();
      const joinTime = 1_700_000_000_000;
      vi.setSystemTime(joinTime);

      const recording = new Recording(client, "session-1", tempDir, null);

      await recording.join("guild-1", "channel-1");
      vi.setSystemTime(joinTime + 500);

      const onData = receiver.on.mock.calls[0][1] as (
        data: Buffer,
        userId: string,
      ) => void;
      onData(Buffer.from([1]), "user-1");
      await vi.runAllTimersAsync();

      await recording.stop();
      await recording.finalize();

      const manifestRaw = await readFile(
        path.join(tempDir, "session-1", MANIFEST_FILENAME),
        "utf-8",
      );
      const manifest = JSON.parse(manifestRaw) as {
        session_started_at_ms: number;
        speakers: Record<
          string,
          { speaking_bursts: Array<{ session_offset_ms: number }> }
        >;
      };

      expect(manifest.session_started_at_ms).toBe(joinTime);
      expect(manifest.speakers["user-1"]?.speaking_bursts).toHaveLength(1);
      expect(manifest.speakers["user-1"]?.speaking_bursts[0]?.session_offset_ms).toBe(
        500,
      );
    });

    it("creates two bursts when packets are spaced beyond SILENCE_GAP_MS", async () => {
      tempDir = await mkdtemp(path.join(os.tmpdir(), "escriba-rec-"));
      const { client, receiver } = createMockVoiceSetup();
      const joinTime = 1_700_000_000_000;
      vi.setSystemTime(joinTime);

      const recording = new Recording(
        client,
        "session-1",
        tempDir,
        null,
        new Set(),
        2000,
      );

      await recording.join("guild-1", "channel-1");

      const onData = receiver.on.mock.calls[0][1] as (
        data: Buffer,
        userId: string,
      ) => void;

      vi.setSystemTime(joinTime + 100);
      onData(Buffer.from([1]), "user-1");
      await vi.runAllTimersAsync();

      vi.setSystemTime(joinTime + 5000);
      onData(Buffer.from([2]), "user-1");
      await vi.runAllTimersAsync();

      await recording.stop();
      await recording.finalize();

      const manifestRaw = await readFile(
        path.join(tempDir, "session-1", MANIFEST_FILENAME),
        "utf-8",
      );
      const manifest = JSON.parse(manifestRaw) as {
        speakers: Record<
          string,
          {
            speaking_bursts: Array<{
              session_offset_ms: number;
              wav_offset_bytes: number;
              pcm_bytes: number;
            }>;
          }
        >;
      };

      const bursts = manifest.speakers["user-1"]?.speaking_bursts;
      expect(bursts).toHaveLength(2);
      expect(bursts?.[0]?.session_offset_ms).toBe(100);
      expect(bursts?.[0]?.wav_offset_bytes).toBe(0);
      expect(bursts?.[0]?.pcm_bytes).toBe(1920);
      expect(bursts?.[1]?.session_offset_ms).toBe(5000);
      expect(bursts?.[1]?.wav_offset_bytes).toBe(1920);
      expect(bursts?.[1]?.pcm_bytes).toBe(1920);
    });

    it("keeps a single burst for continuous packets", async () => {
      tempDir = await mkdtemp(path.join(os.tmpdir(), "escriba-rec-"));
      const { client, receiver } = createMockVoiceSetup();
      const joinTime = 1_700_000_000_000;
      vi.setSystemTime(joinTime);

      const recording = new Recording(
        client,
        "session-1",
        tempDir,
        null,
        new Set(),
        2000,
      );

      await recording.join("guild-1", "channel-1");

      const onData = receiver.on.mock.calls[0][1] as (
        data: Buffer,
        userId: string,
      ) => void;

      for (let offset = 0; offset <= 1500; offset += 500) {
        vi.setSystemTime(joinTime + offset);
        onData(Buffer.from([offset]), "user-1");
        await vi.runAllTimersAsync();
      }

      await recording.stop();
      await recording.finalize();

      const manifestRaw = await readFile(
        path.join(tempDir, "session-1", MANIFEST_FILENAME),
        "utf-8",
      );
      const manifest = JSON.parse(manifestRaw) as {
        speakers: Record<string, { speaking_bursts: unknown[] }>;
      };

      expect(manifest.speakers["user-1"]?.speaking_bursts).toHaveLength(1);
    });
  });
});
