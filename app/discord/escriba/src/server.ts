import Fastify from "fastify";
import type { Config } from "./config.js";

const startSessionBodySchema = {
  type: "object",
  required: ["sessionId", "guildId", "channelId"],
  properties: {
    sessionId: { type: "string" },
    guildId: { type: "string" },
    channelId: { type: "string" },
  },
} as const;

export async function buildServer(_config: Config) {
  const app = Fastify({ logger: true });

  app.get("/health", async () => ({ ok: true }));

  app.post(
    "/sessions",
    { schema: { body: startSessionBodySchema } },
    async () => ({ ok: true }),
  );

  app.post("/sessions/:id/stop", async () => ({ ok: true }));

  return app;
}
