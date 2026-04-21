# Architecture — Tabletop RPG Platform

## Pattern

**Modular monolith** (FastAPI). Each bounded context is a self-contained Python package with exclusive data ownership. Module boundaries are strict enough that any BC could be extracted to a microservice if scale demands it. No shared models across packages.

**Three clear layers** within every BC: HTTP entrypoints (routers), business logic (services), and data access (repositories). External APIs and SDKs are wrapped in client classes under `http/client/` — services receive a client object and never import an SDK directly. Keep it simple: YAGNI, KISS, good encapsulation.

---

## Frontend Stack

| Concern | Choice |
|---|---|
| Framework | React + Vite |
| Routing | TanStack Router |
| Server state | TanStack Query (React Query) |
| Local/session state | Zustand |
| Rich text editor | TipTap (ProseMirror-based, AI-friendly) |
| Map/canvas | Konva.js (React-Konva) |
| Real-time client | Centrifugo JS SDK |

**Rationale:** TipTap's JSON output (ProseMirror format) maps directly to the backend storage model and supports AI-driven document mutations. Konva handles the layered canvas needs of the map editor (terrain, tokens, GM layer, fog of war, drawing tools) with a React-native API. TanStack Query manages server state and cache invalidation; Zustand handles ephemeral UI state (open modals, active tool, local selections).

---

## Backend Stack

| Concern | Choice |
|---|---|
| Framework | FastAPI (Python) |
| ORM | SQLModel (one database per BC, multiple schemas/tables per database) |
| Authentication | Firebase Auth (token verification via Admin SDK) |
| Real-time | Centrifugo (dedicated messaging server) |
| Centrifugo broker | NATS JetStream (self-hosted, message persistence) |

---

## Storage

| BC | Storage | Notes |
|---|---|---|
| IAM | Firebase Auth + Cloud SQL | Firebase owns AuthN; Cloud SQL stores AuthZ data (roles, grants) |
| Campaigns | Cloud SQL | Relational membership and role assignments |
| Wiki | Cloud SQL | TipTap JSON as `jsonb`; full-text search via `tsvector` generated column |
| Compendium | Cloud SQL | Schema-enforced structured rules data (SRD content) |
| Characters | Cloud SQL | Complex relational state; runtime HP/slots/conditions |
| Assets | Cloud SQL (metadata) + GCS (files) | Pre-signed URLs for direct client upload; CDN-served reads |
| Maps | Cloud SQL | Layered map definition; live state owned by Session |
| Session | Centrifugo (runtime) + Cloud SQL (snapshots) | Ephemeral real-time state; periodic persistence |
| Assistant | Cloud SQL | Conversation threads, message history, tool call logs |

**One Cloud SQL database per bounded context.** Each BC has its own database with however many schemas and tables it needs. Enforces strict data ownership at the infrastructure level and preserves the extraction path to microservices.

**Local dev:** MinIO replaces GCS; NATS and Centrifugo run in Docker Compose.

### Wiki Full-Text Search

TipTap document content is stored as `jsonb`. A generated `tsvector` column indexes extracted text for PostgreSQL native FTS — no additional search service required in v1.

```sql
content_tsv tsvector GENERATED ALWAYS AS (
  to_tsvector('english', jsonb_to_text(content))
) STORED
```

---

## Real-Time Infrastructure

```
FastAPI BC  →  publish event  →  Centrifugo  →  WebSocket  →  Browser clients
                                      ↕
                                NATS JetStream
                              (message persistence
                               + history replay)
```

**Centrifugo** is deployed as a dedicated service. The FastAPI backend publishes events via Centrifugo's HTTP API. All WebSocket connections are managed by Centrifugo — the application server is stateless.

**NATS JetStream** runs alongside Centrifugo as the broker engine. Self-hosted (single binary, ~10 MB idle). JetStream provides durable message history and replay, covering Session history and connection recovery without a managed cache service.

Centrifugo rooms map 1:1 to live sessions. Presence channels (who's connected) and message history are built-in.

---

## AI Layer

The Assistant BC exposes a tool registry. AI provider SDK calls are wrapped in client classes under `http/client/` — `AssistantService` never imports an SDK directly.

```
AssistantService
  └── AnthropicClient  (or OpenAIClient / OllamaClient — chosen by config)
  └── ImageGenClient   (DALL-E or Replicate — chosen by config)
```

**Provider selection:** a simple factory in `config.py` / `dependencies.py` reads `ASSISTANT_LLM_PROVIDER` and returns the right client. Users choose their LLM model per conversation; GMs choose the image generation provider in campaign settings.

**Tool registry:** the Assistant calls the same API endpoints as the frontend (dual-purpose API principle). No special internal shortcuts — if the frontend can do it, the AI can do it through the same interface.

**Context injection:** the Assistant receives the user's current location (Wiki document, character sheet, map, session) and injects relevant context into the system prompt before each request.

---

## Authentication & Authorization

**AuthN:** Firebase Auth. Clients obtain a Firebase JWT; all FastAPI requests verify it via the Firebase Admin SDK. A `FirebaseClient` in `modules/shared/module/auth/` wraps the Admin SDK — services receive the client via DI and never import Firebase directly.

**AuthZ — two-layer model:**
1. **Coarse-grained (Campaigns BC):** GM vs Player, resolved per campaign. Every other BC trusts this role.
2. **Fine-grained (each BC):** resource-level access rules enforced by the owning BC. Example: Wiki enforces per-folder/per-document ACL; Session enforces token ownership.

The IAM module stores AuthZ data (resource grants, custom permissions) in its own Cloud SQL instance and exposes it via its `public_api/` Protocol — not a network call.

---

## Infrastructure (GCP)

| Concern | Service |
|---|---|
| Cloud provider | Google Cloud Platform |
| App hosting | Cloud Run (stateless NestJS containers) |
| Database | Cloud SQL (PostgreSQL), one instance per BC |
| File storage | Cloud Storage (GCS) |
| Auth | Firebase Authentication |
| Real-time | Centrifugo + NATS on a single Compute Engine instance |
| CDN (assets) | Cloud CDN in front of GCS |
| Container registry | Artifact Registry |
| Secrets | Secret Manager |

**Centrifugo + NATS** run together on a small Compute Engine instance (not Cloud Run — they are stateful). For a hobby-scale project this is a single `e2-small` or similar.

---

## External client encapsulation

SDK and HTTP clients live in `http/client/` inside each BC. The client is responsible for all SDK/HTTP details — auth headers, timeouts, request/response mapping to Pydantic types. Services receive the client via DI and work with plain Python types.

This applies to: storage (GCS/MinIO), AI providers, image generation, Firebase Auth, payment gateways, and any future third-party service. Swap providers by updating the factory function in `dependencies.py` — no service code changes needed.

---

## Open Decisions

- **Rich text collaboration (Yjs):** TipTap supports real-time collaborative editing via Yjs. Not in v1 — Wiki documents are single-author. Architecture supports adding it later (Centrifugo's pub/sub is a natural Yjs provider transport).
- **Image generation provider defaults:** DALL-E 3 vs Replicate SD models — benchmark quality and cost before setting a default. Both clients ship in v1.
- **Compendium ingestion pipeline:** SRD data needs a one-time import script. Format and tooling TBD when Characters BC is being built.
- **Session snapshot frequency:** how often live session state is checkpointed to Cloud SQL is a tuning decision for the Session BC implementation.
