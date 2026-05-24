# O Escriba notifies the session_transcription module via direct HTTP after WAV finalization

After WAV finalization, O Escriba POSTs a notification to the `session_transcription` API module with the file paths on the shared Docker volume. The `session_transcription` module handles the rest: GCS upload, Whisper API call, Transcript storage, and Artifact generation trigger.

Everything runs on a single VM (ADR-0004) where a shared volume is always reachable, and the Transcription Service in production is a managed API call (ADR-0003). A message broker would add infrastructure complexity with no benefit at this scale. FastAPI's built-in background tasks handle the async work after the HTTP response is returned, keeping O Escriba decoupled from transcription latency.

## Considered Options

- **Message broker (queue-based dispatch)**: justified when producer and consumer run on separate machines or need durable retry across network partitions. Neither applies here.
- **Direct HTTP (chosen)**: zero infrastructure, observable via standard HTTP logging, and sufficient for a single-VM deployment where caller and callee are always co-located.
