import type { TaskPublisher } from "./celery-publisher.js";
import type { DiscordClientLike } from "./recording.js";
import { Recording } from "./recording.js";

export class SessionAlreadyActiveError extends Error {
  constructor() {
    super("session already active");
    this.name = "SessionAlreadyActiveError";
  }
}

export class SessionManager {
  private readonly sessions = new Map<string, Recording>();
  private readonly pendingFinalizations = new Map<string, Promise<void>>();

  constructor(
    private readonly client: DiscordClientLike,
    private readonly recordingsDir: string,
    private readonly taskPublisher: TaskPublisher | null,
    private readonly ignoredUserIds: ReadonlySet<string> = new Set(),
  ) {}

  get activeSessionCount(): number {
    return this.sessions.size;
  }

  hasActiveSession(): boolean {
    return this.sessions.size > 0;
  }

  async start(
    sessionId: string,
    guildId: string,
    channelId: string,
  ): Promise<void> {
    if (this.hasActiveSession() && !this.sessions.has(sessionId)) {
      throw new SessionAlreadyActiveError();
    }

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

    const finalizePromise = recording.finalize().catch((err: unknown) => {
      console.error(
        `[session-manager] background finalize failed sessionId=${sessionId}`,
        err,
      );
    });
    this.pendingFinalizations.set(sessionId, finalizePromise);
    void finalizePromise.finally(() => {
      this.pendingFinalizations.delete(sessionId);
    });
  }

  async discard(sessionId: string): Promise<void> {
    const recording = this.sessions.get(sessionId);
    if (!recording) {
      return;
    }

    this.sessions.delete(sessionId);

    try {
      await recording.discard();
    } catch (err: unknown) {
      console.error(
        `[session-manager] discard failed sessionId=${sessionId}`,
        err,
      );
      throw err;
    }
  }

  async stopAll(): Promise<void> {
    const sessionIds = [...this.sessions.keys()];
    await Promise.all(sessionIds.map((sessionId) => this.stop(sessionId)));
  }

  async drainFinalizations(timeoutMs: number): Promise<void> {
    const pending = [...this.pendingFinalizations.entries()];
    if (pending.length === 0) {
      return;
    }

    const sessionIds = pending.map(([sessionId]) => sessionId);
    const promises = pending.map(([, promise]) => promise);

    let timedOut = false;
    await Promise.race([
      Promise.all(promises),
      new Promise<void>((resolve) => {
        setTimeout(() => {
          timedOut = true;
          resolve();
        }, timeoutMs);
      }),
    ]);

    if (timedOut) {
      console.warn(
        `[session-manager] finalize drain timed out after ${timeoutMs}ms`,
        { sessionIds },
      );
    }
  }
}
