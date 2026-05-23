import { loadConfig } from "./config.js";
import { buildServer } from "./server.js";

async function main(): Promise<void> {
  const config = loadConfig();
  const app = await buildServer(config);

  await app.listen({ port: config.PORT, host: "0.0.0.0" });
}

main().catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});
