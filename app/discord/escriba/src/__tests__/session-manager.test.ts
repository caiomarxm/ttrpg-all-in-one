import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { TaskPublisher } from "../celery-publisher.js";
import type { DiscordClientLike } from "../recording.js";
import { Recording } from "../recording.js";
import { SessionManager } from "../session-manager.js";

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

  it("stopAll stops every active session", async () => {
    const first = createMockRecording();
    const second = createMockRecording();
    MockRecording.mockImplementationOnce(
      () => first as unknown as Recording,
    ).mockImplementationOnce(() => second as unknown as Recording);

    const manager = new SessionManager(client, "/tmp", taskPublisher);
    await manager.start("session-1", "guild-1", "channel-1");
    await manager.start("session-2", "guild-1", "channel-2");
    await manager.stopAll();

    expect(first.stop).toHaveBeenCalledTimes(1);
    expect(second.stop).toHaveBeenCalledTimes(1);
    expect(first.finalize).toHaveBeenCalledTimes(1);
    expect(second.finalize).toHaveBeenCalledTimes(1);
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
