import { randomUUID } from "node:crypto";
import amqplib from "amqplib";

export const TRANSCRIBE_TASK_NAME = "transcribe_session";
export const CELERY_QUEUE = "celery";

export type TaskPublisher = {
  publishTranscribeSession(sessionId: string): Promise<void>;
  close(): Promise<void>;
};

export async function tryConnectTaskPublisher(
  rabbitmqUrl: string,
): Promise<TaskPublisher | null> {
  try {
    return await createCeleryPublisher(rabbitmqUrl);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.warn(
      "[rabbitmq] broker unavailable at startup; recording without transcription enqueue",
      { rabbitmqUrl, error: message },
    );
    return null;
  }
}

export async function createCeleryPublisher(
  rabbitmqUrl: string,
): Promise<TaskPublisher> {
  const connection = await amqplib.connect(rabbitmqUrl);
  const channel = await connection.createChannel();
  await channel.assertQueue(CELERY_QUEUE, { durable: true });

  return {
    async publishTranscribeSession(sessionId: string): Promise<void> {
      const taskId = randomUUID();
      const args = [{ sessionId }];
      const kwargs = {};
      const body = Buffer.from(
        JSON.stringify([
          args,
          kwargs,
          { callbacks: null, errbacks: null, chain: null },
        ]),
      );

      const published = channel.publish("", CELERY_QUEUE, body, {
        contentType: "application/json",
        contentEncoding: "utf-8",
        deliveryMode: 2,
        headers: {
          lang: "py",
          task: TRANSCRIBE_TASK_NAME,
          id: taskId,
          root_id: taskId,
          parent_id: null,
          group: null,
          retries: 0,
          eta: null,
          expires: null,
          timelimit: [null, null],
          argsrepr: JSON.stringify(args),
          kwargsrepr: JSON.stringify(kwargs),
          origin: "o-escriba",
        },
        correlationId: taskId,
      });

      if (!published) {
        throw new Error("Failed to publish transcribe_session task");
      }
    },

    async close(): Promise<void> {
      await channel.close();
      await connection.close();
    },
  };
}
