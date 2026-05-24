import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { FastifyInstance } from "fastify";
import { loadConfig } from "../config.js";
import { buildServer } from "../server.js";
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

describe("O Escriba HTTP API", () => {
  let app: FastifyInstance;
  const start = vi.fn().mockResolvedValue(undefined);
  const stop = vi.fn().mockResolvedValue(undefined);
  const discard = vi.fn().mockResolvedValue(undefined);
  const sessions = {
    start,
    stop,
    discard,
    activeSessionCount: 0,
  } as unknown as SessionManager;

  beforeAll(async () => {
    app = await buildServer(
      loadConfig({
        PORT: "3000",
        RECORDINGS_DIR: "/tmp/recordings-test",
        TRANSCRIPTION_API_URL: "http://localhost:8080/session-transcription",
      }),
      { sessions, discordReady: () => true },
    );
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  it("GET /health returns 200 with active session count", async () => {
    const response = await app.inject({ method: "GET", url: "/health" });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ ok: true, activeSessions: 0 });
  });

  it("POST /sessions starts session via SessionManager", async () => {
    start.mockClear();

    const response = await app.inject({
      method: "POST",
      url: "/sessions",
      payload: {
        sessionId: "session-test",
        guildId: "123",
        channelId: "456",
      },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ ok: true });
    expect(start).toHaveBeenCalledWith("session-test", "123", "456");
  });

  it("POST /sessions/:id/stop stops session via SessionManager", async () => {
    stop.mockClear();

    const response = await app.inject({
      method: "POST",
      url: "/sessions/session-test/stop",
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ ok: true });
    expect(stop).toHaveBeenCalledWith("session-test");
  });

  it("POST /sessions/:id/discard discards session via SessionManager", async () => {
    discard.mockClear();

    const response = await app.inject({
      method: "POST",
      url: "/sessions/session-test/discard",
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ ok: true });
    expect(discard).toHaveBeenCalledWith("session-test");
  });

  it("POST /sessions returns 409 when a session is already active", async () => {
    start.mockImplementationOnce(() => {
      throw new SessionAlreadyActiveError();
    });

    const response = await app.inject({
      method: "POST",
      url: "/sessions",
      payload: {
        sessionId: "session-other",
        guildId: "123",
        channelId: "456",
      },
    });

    expect(response.statusCode).toBe(409);
    expect(response.json()).toEqual({
      ok: false,
      error: "session already active",
    });
  });

  it("POST /sessions succeeds when transcriptionNotifier is null", async () => {
    const recording = {
      join: vi.fn().mockResolvedValue(undefined),
      stop: vi.fn().mockResolvedValue(undefined),
      finalize: vi.fn().mockResolvedValue(undefined),
      isJoined: false,
    };
    MockRecording.mockImplementation(() => recording as unknown as Recording);

    const client = {} as DiscordClientLike;
    const degradedSessions = new SessionManager(
      client,
      "/tmp/recordings-test",
      null,
    );
    const degradedApp = await buildServer(
      loadConfig({
        PORT: "3000",
        RECORDINGS_DIR: "/tmp/recordings-test",
      }),
      { sessions: degradedSessions, discordReady: () => true },
    );
    await degradedApp.ready();

    const response = await degradedApp.inject({
      method: "POST",
      url: "/sessions",
      payload: {
        sessionId: "session-degraded",
        guildId: "123",
        channelId: "456",
      },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ ok: true });
    expect(recording.join).toHaveBeenCalledWith("123", "456");
    await degradedApp.close();
  });

  it("POST /sessions returns 503 when Discord is not ready", async () => {
    const offlineApp = await buildServer(
      loadConfig({ PORT: "3000" }),
      { sessions: null, discordReady: () => false },
    );
    await offlineApp.ready();

    const response = await offlineApp.inject({
      method: "POST",
      url: "/sessions",
      payload: {
        sessionId: "session-offline",
        guildId: "123",
        channelId: "456",
      },
    });

    expect(response.statusCode).toBe(503);
    await offlineApp.close();
  });
});
