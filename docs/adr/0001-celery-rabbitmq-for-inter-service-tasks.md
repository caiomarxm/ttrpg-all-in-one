# RabbitMQ + Celery for inter-service task dispatch

The system has two async handoffs: Bot → Transcription Service (audio ready), and Transcription Service → Cronista Worker (transcript ready). We chose RabbitMQ as the broker and Celery as the task executor rather than simpler alternatives (file watchers, direct HTTP).

This makes the local dev setup heavier than strictly necessary, but it means the handoff mechanism never changes as the system evolves toward S3-backed storage and potentially remote workers — only the transport layer beneath it changes. Task definitions are shared code, so both producer and consumer stay in sync.

## Considered Options

- **File watcher (inotify/watchdog)**: zero infrastructure, but polling-based and breaks entirely if audio moves to S3.
- **Direct HTTP between containers**: simpler but creates tight coupling — services need to know each other's addresses and be up simultaneously.
- **RabbitMQ + Celery** *(chosen)*: adds infrastructure overhead locally, but the task model is location-transparent and survives the S3 migration without changing call sites.
