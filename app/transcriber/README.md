# Transcriber

Celery worker that consumes `transcribe_session` tasks from RabbitMQ, runs faster-whisper (PT-BR), and writes `transcript.txt` under `/data/recordings/{sessionId}/`.

Planned in Slice D — see `docs/plans/voice-recorder-sidecar.md` and beads issue `ttrpg-423`.
