import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  CELERY_QUEUE,
  TRANSCRIBE_TASK_NAME,
  createCeleryPublisher,
} from "../celery-publisher.js";

const amqpMocks = vi.hoisted(() => {
  const connect = vi.fn();
  const createChannel = vi.fn();
  const assertQueue = vi.fn();
  const publish = vi.fn();
  const channelClose = vi.fn();
  const connectionClose = vi.fn();

  return {
    connect,
    createChannel,
    assertQueue,
    publish,
    channelClose,
    connectionClose,
  };
});

vi.mock("amqplib", () => ({
  default: {
    connect: amqpMocks.connect,
  },
}));

describe("createCeleryPublisher", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    amqpMocks.connect.mockResolvedValue({
      createChannel: amqpMocks.createChannel,
      close: amqpMocks.connectionClose,
    });
    amqpMocks.createChannel.mockResolvedValue({
      assertQueue: amqpMocks.assertQueue,
      publish: amqpMocks.publish,
      close: amqpMocks.channelClose,
    });
    amqpMocks.assertQueue.mockResolvedValue({});
    amqpMocks.publish.mockReturnValue(true);
  });

  it("publishes transcribe_session with Celery headers", async () => {
    const publisher = await createCeleryPublisher("amqp://localhost");

    await publisher.publishTranscribeSession("session-abc");

    expect(amqpMocks.assertQueue).toHaveBeenCalledWith(CELERY_QUEUE, {
      durable: true,
    });
    expect(amqpMocks.publish).toHaveBeenCalledTimes(1);

    const [, queue, body, options] = amqpMocks.publish.mock.calls[0] as [
      string,
      string,
      Buffer,
      { headers: Record<string, unknown> },
    ];

    expect(queue).toBe(CELERY_QUEUE);
    expect(JSON.parse(body.toString("utf8"))).toEqual([
      [{ sessionId: "session-abc" }],
      {},
      { callbacks: null, errbacks: null, chain: null },
    ]);
    expect(options.headers.task).toBe(TRANSCRIBE_TASK_NAME);

    await publisher.close();
    expect(amqpMocks.channelClose).toHaveBeenCalled();
    expect(amqpMocks.connectionClose).toHaveBeenCalled();
  });
});
