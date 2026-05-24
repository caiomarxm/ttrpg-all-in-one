import type { TaskPublisher } from "./celery-publisher.js";
import type { DiscordClientLike } from "./recording.js";
import { Recording } from "./recording.js";

export class SessionManager {
  private readonly sessions = new Map<string, Recording>();

  constructor(
    private readonly client: DiscordClientLike,
    private readonly recordingsDir: string,
    private readonly taskPublisher: TaskPublisher | null,
    private readonly ignoredUserIds: ReadonlySet<string> = new Set(),
  ) {}

  async start(
    sessionId: string,
    guildId: string,
    channelId: string,
  ): Promise<void> {
    let recording = this.sessions.get(sessionId);
    if (!recording) {
      recording = new Recording(
        this.client,
        sessionId,
        this.recordingsDir,
        this.taskPublisher,
        this.ignoredUserIds,
      );
      this.sessions.set(sessionId, recording);
    }

    await recording.join(guildId, channelId);
  }

  async stop(sessionId: string): Promise<void> {
    const recording = this.sessions.get(sessionId);
    if (!recording) {
      return;
    }

    await recording.stop();
    this.sessions.delete(sessionId);
  }
}
