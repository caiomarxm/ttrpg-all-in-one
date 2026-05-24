import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { TaskPublisher } from "../celery-publisher.js";
import type { DiscordClientLike } from "../recording.js";
import { Recording } from "../recording.js";
import {
  SessionAlreadyActiveError,
  SessionManager,
} from "../session-manager.js";

vi.mock("../recording.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../recording.js")>();
  return {
    ...actual,
    Recording: vi.fn(),
  };
});

const MockRecording = vi.mocked(Recording);

function createMockRecording() {
  return {
    join: vi.fn().mockResolvedValue(undefined),
    stop: vi.fn().mockResolvedValue(undefined),
    finalize: vi.fn().mockResolvedValue(undefined),
    isJoined: false,
  };
}

describe("SessionManager", () => {
  const client = {} as DiscordClientLike;
  let taskPublisher: TaskPublisher;

  beforeEach(() => {
    vi.clearAllMocks();
    taskPublisher = {
      publishTranscribeSession: vi.fn(),
      close: vi.fn(),
    };
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("start rejects a second session while one is active", async () => {
    const recording = createMockRecording();
    MockRecording.mockImplementation(() => recording as unknown as Recording);

    const manager = new SessionManager(client, "/tmp", taskPublisher);
    await manager.start("session-1", "guild-1", "channel-1");

    await expect(
      manager.start("session-2", "guild-1", "channel-2"),
    ).rejects.toThrow(SessionAlreadyActiveError);
    expect(MockRecording).toHaveBeenCalledTimes(1);
  });

  it("start allows re-join for the same session id", async () => {
    const recording = createMockRecording();
    MockRecording.mockImplementation(() => recording as unknown as Recording);

    const manager = new SessionManager(client, "/tmp", taskPublisher);
    await manager.start("session-1", "guild-1", "channel-1");
    await manager.start("session-1", "guild-1", "channel-1");

    expect(recording.join).toHaveBeenCalledTimes(2);
    expect(MockRecording).toHaveBeenCalledTimes(1);
  });

  it("stop removes session and finalizes in the background", async () => {
    const recording = createMockRecording();
    MockRecording.mockImplementation(() => recording as unknown as Recording);

    const manager = new SessionManager(client, "/tmp", taskPublisher);
    await manager.start("session-1", "guild-1", "channel-1");
    await manager.stop("session-1");

    expect(recording.stop).toHaveBeenCalledTimes(1);
    expect(recording.finalize).toHaveBeenCalledTimes(1);
    expect(MockRecording).toHaveBeenCalledTimes(1);
  });

  it("stopAll stops the active session", async () => {
    const recording = createMockRecording();
    MockRecording.mockImplementation(() => recording as unknown as Recording);

    const manager = new SessionManager(client, "/tmp", taskPublisher);
    await manager.start("session-1", "guild-1", "channel-1");
    await manager.stopAll();

    expect(recording.stop).toHaveBeenCalledTimes(1);
    expect(recording.finalize).toHaveBeenCalledTimes(1);
    expect(MockRecording).toHaveBeenCalledTimes(1);
  });

  it("drainFinalizations waits for in-flight finalize promises", async () => {
    vi.useFakeTimers();

    let resolveFinalize!: () => void;
    const recording = createMockRecording();
    recording.finalize.mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          resolveFinalize = resolve;
        }),
    );
    MockRecording.mockImplementation(() => recording as unknown as Recording);

    const manager = new SessionManager(client, "/tmp", taskPublisher);
    await manager.start("session-1", "guild-1", "channel-1");
    await manager.stop("session-1");

    const drainPromise = manager.drainFinalizations(30_000);
    await vi.advanceTimersByTimeAsync(0);
    expect(recording.finalize).toHaveBeenCalledTimes(1);

    resolveFinalize();
    await drainPromise;
  });

  it("drainFinalizations logs and returns when finalize exceeds timeout", async () => {
    vi.useFakeTimers();
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    const recording = createMockRecording();
    recording.finalize.mockImplementation(() => new Promise(() => {}));
    MockRecording.mockImplementation(() => recording as unknown as Recording);

    const manager = new SessionManager(client, "/tmp", taskPublisher);
    await manager.start("session-1", "guild-1", "channel-1");
    await manager.stop("session-1");

    const drainPromise = manager.drainFinalizations(100);
    await vi.advanceTimersByTimeAsync(100);
    await drainPromise;

    expect(warnSpy).toHaveBeenCalledWith(
      "[session-manager] finalize drain timed out after 100ms",
      { sessionIds: ["session-1"] },
    );

    warnSpy.mockRestore();
  });
});
