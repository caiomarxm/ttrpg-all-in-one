# Context Map

## Contexts

- [IAM](./app/api/modules/iam/CONTEXT.md) — authenticates users and issues identity tokens
- [Campaigns](./app/api/modules/campaigns/CONTEXT.md) — organizes participants into campaigns and assigns coarse-grained roles
- [O Cronista](./app/discord/cronista/CONTEXT.md) — manages Session lifecycle via Discord; O Escriba captures Recordings
- Session Transcription (`app/api/modules/session_transcription/`) — receives Recording notifications from O Escriba, uploads to GCS, transcribes via Whisper API, stores Transcripts, triggers Artifact generation

## Relationships

- **IAM → Campaigns**: Campaigns consumes IAM-issued user identity to resolve membership and roles
- **IAM → all BCs**: all bounded contexts validate requests against IAM-issued JWT tokens
