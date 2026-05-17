# Transcription runs in a separate container

faster-whisper inference is CPU-heavy and blocking. Running it inside the Discord bot container would stall event loop processing during active sessions. We run the Transcription Service as its own container so the bot stays responsive at all times.

Similarly, Crônica generation (OpenRouter calls) runs in a dedicated Cronista Worker container — the bot container handles Discord interaction only. This gives each process a single entrypoint and a clear reason to exist.
