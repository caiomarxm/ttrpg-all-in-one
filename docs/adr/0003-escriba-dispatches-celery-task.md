# O Escriba dispatches the transcription Celery task

After `/stop`, O Cronista calls O Escriba via HTTP. O Escriba immediately leaves the voice channel, returns `{ ok: true }`, and then — asynchronously — closes the Recording write streams, patches WAV headers, and dispatches the `transcribe_session` Celery task. It does not return Recording paths to Cronista for Cronista to dispatch.

The async boundary is the voice channel leave: once the bot is gone from the channel, Cronista's job is done. Everything after that (file finalisation, task dispatch) is O Escriba's responsibility and runs in the background. If the background work fails, O Escriba logs the failure with full context (sessionId, WAV paths attempted) so an operator can manually re-enqueue.

**Note:** the original implementation blocked the HTTP response on both WAV writes and task dispatch, which contradicts this decision. The implementation must be corrected to match.

## Considered Options

- **Cronista dispatches**: requires the HTTP call to block until WAV files are fully written and return their paths. Adds latency to `/stop`, couples Cronista to O Escriba's I/O timing, and blocks the user response until disk I/O completes.
- **O Escriba dispatches, synchronous** *(original, incorrect implementation)*: same coupling problem — HTTP response blocked on disk writes and AMQP publish.
- **O Escriba dispatches, async** *(chosen)*: voice channel leave is synchronous (fast); file writes and task dispatch happen in the background. Cronista is decoupled from O Escriba's I/O timing entirely.
