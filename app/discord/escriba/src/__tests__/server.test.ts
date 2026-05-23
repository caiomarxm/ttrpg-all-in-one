import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { FastifyInstance } from "fastify";
import { loadConfig } from "../config.js";
import { buildServer } from "../server.js";
import type { SessionManager } from "../session-manager.js";

describe("O Escriba HTTP API", () => {
  let app: FastifyInstance;
  const start = vi.fn().mockResolvedValue(undefined);
  const stop = vi.fn().mockResolvedValue(undefined);
  const sessions = { start, stop } as unknown as SessionManager;

  beforeAll(async () => {
    app = await buildServer(
      loadConfig({
        PORT: "3000",
        RECORDINGS_DIR: "/tmp/recordings-test",
        RABBITMQ_URL: "amqp://localhost:5672",
      }),
      { sessions, discordReady: () => true },
    );
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  it("GET /health returns 200 { ok: true }", async () => {
    const response = await app.inject({ method: "GET", url: "/health" });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ ok: true });
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
