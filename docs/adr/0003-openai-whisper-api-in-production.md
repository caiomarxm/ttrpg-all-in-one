# OpenAI Whisper API in production; faster-whisper-server in local dev

The Transcription Service runs faster-whisper locally (via `faster-whisper-server`, which exposes an OpenAI-compatible `/v1/audio/transcriptions` endpoint), but in production it is replaced entirely by the OpenAI Whisper API. No model is hosted in production. The only difference between environments is the `WHISPER_BASE_URL` env var — FastAPI's Whisper client code is identical in both.

This eliminates the transcriber container, model hosting, and CPU sizing concerns in production. At hobby scale the per-minute Whisper API cost is negligible and the operational savings are significant. Local dev is preserved for offline use and to avoid API costs during development.

## Considered Options

- **Self-host faster-whisper on Compute Engine**: zero per-call cost, but requires CPU/memory sizing for the model and adds a container to manage in production.
- **OpenAI Whisper API (chosen)**: managed, no model hosting, production pipeline simplifies to a single HTTP call from FastAPI. Local dev uses a compatible drop-in server so no code diverges between environments.
