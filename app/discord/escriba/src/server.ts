import Fastify from "fastify";
import type { Config } from "./config.js";
import type { SessionManager } from "./session-manager.js";

const startSessionBodySchema = {
  type: "object",
  required: ["sessionId", "guildId", "channelId"],
  properties: {
    sessionId: { type: "string" },
    guildId: { type: "string" },
    channelId: { type: "string" },
  },
} as const;

export type BuildServerDeps = {
  sessions?: SessionManager | null;
  discordReady?: () => boolean;
};

export async function buildServer(
  _config: Config,
  deps: BuildServerDeps = {},
) {
  const app = Fastify({ logger: true });
  const sessions = deps.sessions ?? null;
  const discordReady = deps.discordReady ?? (() => sessions !== null);

  app.get("/health", async () => ({ ok: true }));

  app.post(
    "/sessions",
    { schema: { body: startSessionBodySchema } },
    async (request, reply) => {
      if (!sessions || !discordReady()) {
        return reply.code(503).send({
          ok: false,
          error: "Discord client not ready",
        });
      }

      const body = request.body as {
        sessionId: string;
        guildId: string;
        channelId: string;
      };

      try {
        await sessions.start(body.sessionId, body.guildId, body.channelId);
      } catch (err: unknown) {
        request.log.error(err, "failed to start recording session");
        return reply.code(500).send({
          ok: false,
          error: err instanceof Error ? err.message : "Failed to join voice channel",
        });
      }

      return { ok: true };
    },
  );

  app.post("/sessions/:id/stop", async (request, reply) => {
    if (!sessions || !discordReady()) {
      return reply.code(503).send({
        ok: false,
        error: "Discord client not ready",
      });
    }

    const { id } = request.params as { id: string };

    try {
      await sessions.stop(id);
    } catch (err: unknown) {
      request.log.error(err, "failed to stop recording session");
      return reply.code(500).send({
        ok: false,
        error: err instanceof Error ? err.message : "Failed to leave voice channel",
      });
    }

    return { ok: true };
  });

  return app;
}
