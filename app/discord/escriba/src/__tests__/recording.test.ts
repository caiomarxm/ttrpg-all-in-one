import { mkdtemp, readdir, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { TaskPublisher } from "../celery-publisher.js";
import {
  Recording,
  isMostlyZeroPacket,
  type DiscordClientLike,
} from "../recording.js";

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
  let publishTranscribeSession: ReturnType<typeof vi.fn>;
  let taskPublisher: TaskPublisher;

  beforeEach(() => {
    vi.clearAllMocks();
    publishTranscribeSession = vi.fn().mockResolvedValue(undefined);
    taskPublisher = {
      publishTranscribeSession,
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
      taskPublisher,
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
      taskPublisher,
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
      taskPublisher,
    );

    await recording.join("guild-1", "channel-1");
    await recording.join("guild-1", "channel-1");

    expect(channel.join).toHaveBeenCalledTimes(1);
  });

  it("stop writes WAV files and publishes transcribe_session", async () => {
    tempDir = await mkdtemp(path.join(os.tmpdir(), "escriba-rec-"));
    const { client, channel, connection, receiver } = createMockVoiceSetup();
    const recording = new Recording(
      client,
      "session-1",
      tempDir,
      taskPublisher,
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

    expect(connection.disconnect).toHaveBeenCalledTimes(1);
    expect(client.closeVoiceConnection).toHaveBeenCalledWith("guild-1");
    expect(decode).toHaveBeenCalledTimes(1);
    expect(publishTranscribeSession).toHaveBeenCalledWith("session-1");

    const files = await readdir(path.join(tempDir, "session-1"));
    expect(files.some((name) => name.startsWith("user-1_"))).toBe(true);
    expect(files.some((name) => name.endsWith(".wav"))).toBe(true);
  });

  it("ignored user packets are dropped and produce no WAV file", async () => {
    tempDir = await mkdtemp(path.join(os.tmpdir(), "escriba-rec-"));
    const { client, receiver } = createMockVoiceSetup();
    const recording = new Recording(
      client,
      "session-1",
      tempDir,
      taskPublisher,
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

    const files = await readdir(path.join(tempDir, "session-1")).catch(
      () => [] as string[],
    );
    expect(files.some((name) => name.startsWith("ignored-user_"))).toBe(false);
    expect(decode).not.toHaveBeenCalled();
  });

  it("stop without join is a no-op", async () => {
    const { client, channel } = createMockVoiceSetup();
    const recording = new Recording(
      client,
      "session-1",
      "/tmp/recordings",
      taskPublisher,
    );

    await recording.stop();

    expect(channel.leave).not.toHaveBeenCalled();
    expect(publishTranscribeSession).not.toHaveBeenCalled();
  });
});
