# RabbitMQ is a soft startup dependency for O Escriba

O Escriba starts and accepts recording sessions regardless of whether RabbitMQ is reachable. The AMQP connection is attempted at startup but a failure does not prevent the process from running. If the connection is unavailable, O Escriba operates in a degraded mode: Recordings are captured and WAV files are written normally, but the `transcribe_session` Celery task cannot be published after stop. In that case O Escriba logs a structured error containing the sessionId and WAV file paths so an operator can manually re-enqueue the task when the broker recovers.

This satisfies architecture principle #10 (fail independence): the Transcription Service being unreachable must not prevent the recorder from doing its job. Crashing the recorder because the downstream queue is down is a disproportionate cascade — the Recording would be lost entirely rather than just delayed.

## Considered Options

- **Hard dependency** *(original)*: O Escriba exits at startup if RabbitMQ is unreachable. Simple and predictable, but causes total Recording loss whenever the broker has a transient failure.
- **Soft dependency** *(chosen)*: O Escriba starts regardless. Publish failures are logged with enough context for manual recovery. The WAV files on the shared volume are the durable artifact; the Celery task is just a pointer to them.
