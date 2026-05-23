import Eris from "eris";

const GATEWAY_INTENTS = [
  "guilds",
  "guildVoiceStates",
] as const;

export function createDiscordClient(token: string): Eris.Client {
  return new Eris.Client(token, {
    gateway: {
      intents: [...GATEWAY_INTENTS],
    },
  });
}

export function waitForDiscordReady(client: Eris.Client): Promise<void> {
  if (client.ready) {
    return Promise.resolve();
  }

  return new Promise((resolve, reject) => {
    const onReady = () => {
      cleanup();
      resolve();
    };
    const onError = (err: Error) => {
      cleanup();
      reject(err);
    };

    const cleanup = () => {
      client.removeListener("ready", onReady);
      client.removeListener("error", onError);
    };

    client.once("ready", onReady);
    client.once("error", onError);
  });
}
