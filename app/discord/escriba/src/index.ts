import { loadConfig } from "./config.js";
import { tryConnectTranscriptionNotifier } from "./transcription-client.js";
import {
  createDiscordClient,
  waitForDiscordReady,
} from "./discord-client.js";
import { SessionManager } from "./session-manager.js";
import { buildServer } from "./server.js";

async function main(): Promise<void> {
  const config = loadConfig();

  if (!config.RECORDER_TOKEN) {
    throw new Error("RECORDER_TOKEN is required to start O Escriba");
  }

  const client = createDiscordClient(config.RECORDER_TOKEN);
  const transcriptionNotifier = await tryConnectTranscriptionNotifier(
    config.TRANSCRIPTION_API_URL,
  );
  const sessions = new SessionManager(
    client,
    config.RECORDINGS_DIR,
    transcriptionNotifier,
    new Set(config.IGNORED_USER_IDS),
  );

  let shuttingDown = false;

  const shutdown = async () => {
    if (shuttingDown) {
      return;
    }
    shuttingDown = true;

    console.log("[shutdown] stopping active recording sessions");
    await sessions.stopAll();
    await sessions.drainFinalizations(30_000);

    await transcriptionNotifier?.close();
    client.disconnect({ reconnect: false });
    process.exit(0);
  };

  process.once("SIGINT", () => void shutdown());
  process.once("SIGTERM", () => void shutdown());

  client.on("error", (err: Error) => {
    console.error("[discord] client error", err);
  });

  client.connect();
  await waitForDiscordReady(client);
  console.log(`[discord] logged in as ${client.user.username}`);

  const app = await buildServer(config, {
    sessions,
    discordReady: () => client.ready,
  });

  await app.listen({ port: config.PORT, host: "0.0.0.0" });
}

main().catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});
