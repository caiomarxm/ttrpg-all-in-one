# Single Compute Engine VM for all services

All backend services (FastAPI, Centrifugo, NATS, Cronista bot, O Escriba, transcriber stub) run on a single Compute Engine instance managed via Docker Compose. Cloud Run is not used.

This is a hobby-scale project. The operational overhead of Cloud Run (container registry, image builds in CI, per-service deployment pipelines) is disproportionate to the load. A single VM with Docker Compose matches the local dev model exactly — deployment is `git pull && docker compose up --build -d`. Discord bots also require persistent gateway connections that Cloud Run cannot sustain without `min-instances=1`, eliminating its main benefit.

Cloud SQL (PostgreSQL) and Firebase (Authentication + Frontend Hosting) remain as managed GCP services — their managed benefit (durability, auth) outweighs the ops cost even at hobby scale.

## Considered Options

- **Cloud Run per service**: correct for production scale, but Discord bots require persistent connections, and the full CI/CD pipeline (Artifact Registry, per-service deploys) is disproportionate ops overhead for a pet project.
- **Single Compute Engine VM (chosen)**: one SSH target, one `docker compose up`, mirrors local dev exactly. Right trade-off when traffic is low and ops simplicity is the priority.
