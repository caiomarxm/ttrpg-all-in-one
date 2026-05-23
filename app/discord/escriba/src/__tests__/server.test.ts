import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { loadConfig } from "../config.js";
import { buildServer } from "../server.js";

describe("O Escriba HTTP API", () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = await buildServer(
      loadConfig({
        PORT: "3000",
        RECORDINGS_DIR: "/tmp/recordings-test",
        RABBITMQ_URL: "amqp://localhost:5672",
      }),
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

  it("POST /sessions returns 200 { ok: true }", async () => {
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
  });

  it("POST /sessions/:id/stop returns 200 { ok: true }", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/sessions/session-test/stop",
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ ok: true });
  });
});
