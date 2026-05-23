# Transcriber

Celery worker that consumes `transcribe_session` tasks from RabbitMQ, runs faster-whisper (PT-BR), and writes `transcript.txt` under `/data/recordings/{sessionId}/`.

See `docs/plans/voice-recorder-sidecar.md` and ADR-0002.

```bash
# Local tests (mocked Whisper in integration)
just test-transcriber

# Run worker via Compose (with escriba + rabbitmq)
docker compose up transcriber rabbitmq escriba
```
