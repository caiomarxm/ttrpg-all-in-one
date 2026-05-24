# session_transcription module owns the Recording-to-Transcript pipeline

A dedicated `session_transcription` module in `app/api/modules/` owns GCS upload, Whisper API calls, Transcript storage, and Artifact generation triggering. O Escriba has no knowledge of GCS or the Whisper API — its responsibility ends at writing audio to the shared volume and POSTing a notification (ADR-0005).

This keeps O Cronista as a thin Discord interface with no external service integrations beyond the `session_transcription` HTTP endpoint. GCS credentials and the Whisper client live in one bounded context, consistent with the principle that each BC has exclusive ownership of its data and its external integrations.

Recordings are stored under a `recordings/` prefix in GCS with a 30-day lifecycle rule — deleted automatically after that window. The Transcript in Cloud SQL is the durable artifact.
