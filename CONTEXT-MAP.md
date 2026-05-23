# Context Map

## Contexts

- [IAM](./app/api/modules/iam/CONTEXT.md) — authenticates users and issues identity tokens
- [Campaigns](./app/api/modules/campaigns/CONTEXT.md) — organizes participants into campaigns and assigns coarse-grained roles
- [O Cronista](./app/discord/cronista/CONTEXT.md) — manages Session lifecycle via Discord and generates Artifacts; O Escriba (second bot) captures Recordings; Transcriber and Cronista Worker run async processing

## Relationships

- **IAM → Campaigns**: Campaigns consumes IAM-issued user identity to resolve membership and roles
- **IAM → all BCs**: all bounded contexts validate requests against IAM-issued JWT tokens
