# O Escriba dispatches the transcription Celery task

After `/stop`, O Cronista calls O Escriba via HTTP to finish the Recording. O Escriba writes the WAV files to the shared volume and then dispatches the `transcribe_session` Celery task itself — it does not return the Recording paths to Cronista for Cronista to dispatch.

This is counterintuitive: you'd expect the coordinator (Cronista) to own task dispatch. But Cronista cannot safely dispatch until the WAV files are fully written, and only O Escriba knows when that is done. Making the HTTP call synchronous (block until files are flushed, then Cronista dispatches) would add latency to the `/stop` response and couple the two services on write timing. Instead, O Escriba owns the full handoff: finish writing → dispatch task → return `{ ok: true }` to Cronista.

## Considered Options

- **Cronista dispatches**: requires `DELETE /sessions/:id` to block until WAV files are fully written and return their paths. Adds latency to `/stop` and couples Cronista to O Escriba's I/O timing.
- **O Escriba dispatches** *(chosen)*: HTTP call returns immediately after O Escriba acknowledges the stop; file writes and task dispatch happen asynchronously inside O Escriba.
