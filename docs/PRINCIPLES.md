# Platform principles & local development

High-level philosophy, the ten architecture principles, and commands to run the stack locally. Detailed patterns live under **`docs/patterns/backend/`**; infra and storage live in **`ARCHITECTURE.md`**.

---

## Philosophy

**Ship fast by relying on automated tests.** Every feature needs unit tests, every bounded context needs integration tests, and the system needs automated e2e tests. Tests are the primary enabler of velocity. Where tests live on disk is defined in **`patterns/backend/testing.md`**.

**Modular monolith** for both backend and frontend. Each module is a bounded context (DDD). No microservices — services are intentionally large and self-contained. Reference architecture for patterns and layout: `/home/caiomarxm/personal/projects/fakeflix`.

**Three guiding values: YAGNI · KISS · Good encapsulation.**
- **YAGNI** — don't build abstractions until a second concrete use case forces it. One AI provider? One client class, no interface. Two providers? Then add the factory.
- **KISS** — prefer the simplest design that works. Layers exist to separate concerns, not to add indirection.
- **Good encapsulation** — hide implementation details behind a clear surface. Routers hide HTTP concerns from services; repositories hide SQL from services; clients hide SDKs from services. No layer bleeds into another.

**Three layers within every BC:**
1. **Entrypoints** (`http/router/`, future: WebSocket handlers, message consumers) — parse and validate input, call one service method, return a schema
2. **Services** (`core/service/`) — business logic and orchestration; work with plain Python objects and domain types
3. **Repositories** (`persistence/repository/`) — all SQLModel/SQLAlchemy syntax; expose business-named methods only

External APIs and SDKs live in **clients** (`http/client/`) — they translate SDK types to Pydantic models and own all HTTP/auth details. Services receive a client and never see the underlying library.

**Backend:** FastAPI + SQLModel. Modules live in `app/api/modules/`. Apps are thin bootstrap orchestrators. State isolation is critical — **no shared models across modules**.

**Frontend:** React + Vite. Feature-based layout mirrors backend bounded contexts under `app/web/`.

**APIs are dual-purpose:** every API must serve both the frontend and the AI agent (tool calls). Design with this in mind from day one.

---

## Architecture principles

Criticality guide: 🔴 Critical (blocks everything) · 🟠 High (causes pain fast) · 🟡 Medium (matters at scale)

| # | Principle | Criticality |
|---|-----------|-------------|
| 1 | Well-defined boundaries | 🟠 High |
| 2 | Composability | 🟡 Medium |
| 3 | Independence | 🟠 High |
| 4 | Individual scale | 🟡 Medium |
| 5 | Explicit communication | 🟠 High |
| 6 | Replaceability | 🟡 Medium |
| 7 | Deployment independence | 🟡 Medium |
| 8 | State isolation | 🔴 **CRITICAL** |
| 9 | Observability | 🟠 High |
| 10 | Fail independence | 🟠 High |

---

### 1. Well-defined boundaries

Each BC has exclusive data ownership and a clear ubiquitous language. Internal implementation is never exposed to other BCs.

- ✅ Keep all domain logic inside the BC directory
- ✅ Export only `public_api/` Protocols — the sole cross-BC import surface
- ❌ Never import internal services, repositories, or models from another BC
- ❌ Never share SQLModel table definitions across BCs

```python
# ✅ GOOD — other BCs import only the Protocol
from modules.campaigns.public_api.campaigns_public_api import CampaignsPublicApi

# ❌ BAD — internal service leaked across boundary
from modules.campaigns.core.service.campaign_service import CampaignService
```

---

### 2. Composability

Modules are building blocks that combine to form different apps without modification. App bootstrap files are thin orchestrators.

- ✅ Design each BC to work independently or alongside any other BC
- ✅ Keep deployment logic (router mounting, DI wiring) in `main.py`, not in modules
- ❌ Never hard-code cross-BC imports inside a BC's business logic

---

### 3. Independence

Each BC can be built, tested, and reasoned about in isolation.

- ✅ Each BC has its own `config.py` (Pydantic BaseSettings, `{BC}_` env prefix)
- ✅ Each BC's tests run with no dependency on other BC internals
- ✅ Communicate via Protocols (in-process) or HTTP clients (extraction path)
- ❌ Never create shared mutable state between BCs
- ❌ Never call another BC's service methods directly

---

### 4. Individual scale

BCs scale on their own resource profile without affecting neighbours.

- ✅ Module-specific DB connections, config, and worker pools
- ❌ Never create shared resource bottlenecks across BCs (e.g. shared DB connection pools)

---

### 5. Explicit communication

All inter-BC communication happens through declared contracts — never implicit coupling.

- ✅ Define a `Protocol` in `public_api/` for every cross-BC call surface
- ✅ Use Pydantic DTOs for any data crossing a BC boundary
- ✅ HTTP clients (`http/client/`) wrap external API/SDK calls and return Pydantic models
- ❌ Never let another BC assume the internal shape of your models
- ❌ Never import another BC's request/response DTOs directly

```python
# ✅ GOOD — explicit Protocol contract
class CampaignsPublicApi(Protocol):
    async def get_user_role(self, campaign_id: str, user_id: str) -> MemberRole: ...

# ❌ BAD — implicit coupling to internal DTO
from modules.campaigns.http.dto.response.campaign_response import CampaignResponse
```

---

### 6. Replaceability

Modules and clients can be swapped without touching the business logic. Keep this simple — no fancy interface hierarchies.

- ✅ SDK / HTTP library imports live **only** in client classes (`http/client/`)
- ✅ When you have multiple concrete implementations, define a `Protocol` in `http/client/` and use a config-driven factory — the service depends on the Protocol
- ✅ Add the Protocol the moment the second implementation exists — not before (YAGNI)
- ❌ Never import an SDK (`anthropic`, `openai`, `boto3`, `stripe`, …) inside a service
- ❌ Never build a Protocol for an external client speculatively (one implementation = no Protocol needed)

```python
# ✅ GOOD — one provider, one client, no Protocol yet
class AnthropicClient:
    async def complete(self, messages: list[Message]) -> CompletionResult: ...

# ✅ GOOD — second provider arrives → add Protocol + factory
class AIClient(Protocol):  # lives in http/client/, not core/interface/
    async def complete(self, messages: list[Message]) -> CompletionResult: ...

def get_ai_client(config: AssistantConfig) -> AIClient:
    match config.llm_provider:
        case "anthropic": return AnthropicClient(config)
        case "openai":    return OpenAIClient(config)

class AssistantService:
    def __init__(self, ai_client: AIClient): ...  # clean, swappable

# ❌ BAD — service imports the SDK directly
from anthropic import Anthropic  # inside AssistantService ❌
```

---

### 7. Deployment independence

Module boundaries are strict enough that any BC could be extracted to a microservice. No deployment assumptions leak into module code.

- ✅ All config is environment-driven via `config.py`
- ✅ Deployment logic (which routers to mount, which BCs to load) stays in `main.py`
- ❌ Never hard-code hostnames, ports, or infra topology inside a BC

---

### 8. State isolation ⚠️ CRITICAL

This is the most commonly violated principle and the most expensive to fix. Each BC owns its own database and tables exclusively.

- ✅ One DB (or schema) per BC — connection string in `{BC}_DATABASE_URL`
- ✅ Prefix **all** table names with the BC name: `campaign_member`, `wiki_document`, `iam_permission`
- ✅ Use string references (not DB-level foreign keys) for cross-BC relationships
- ✅ Replicate minimal data per BC as needed (e.g. `user_id: str` in every BC's tables)
- ❌ **NEVER** duplicate a table name across BCs — silent data corruption
- ❌ Never share DB tables between BCs
- ❌ Never cross-import another BC's SQLModel table definition
- ❌ Never use `@InjectRepository` / cross-BC session imports

```python
# ✅ GOOD — string reference, no FK
class WikiDocument(BaseModel, table=True):
    __tablename__ = "wiki_document"
    campaign_id: str  # string ref; enforcement in service layer, not DB

# ❌ BAD — cross-BC FK creates coupling at the DB level
campaign_id: int = Field(foreign_key="campaign_campaign.id")  # ❌
```

---

### 9. Observability

Every BC provides individual visibility into its behaviour. Debugging a production issue must not require reading another BC's logs.

- ✅ Structured logging with module name on every service operation
- ✅ Include correlation/request IDs for tracing across BCs
- ✅ Track business metrics (counters, durations) per BC
- ❌ Never mix BC concerns in a single log line or metric

Patterns: **`docs/patterns/backend/integrations.md`** → Structured Logging section.

---

### 10. Fail independence

One BC's failure must not cascade to others. The system degrades gracefully.

- ✅ Circuit breakers on all cross-BC HTTP calls
- ✅ Timeouts + exponential-backoff retries for external dependencies
- ✅ Design non-critical features to return a safe default on failure
- ❌ Never create synchronous call chains that can cascade a single failure across BCs

Patterns: **`docs/patterns/backend/integrations.md`** → Circuit Breakers, Timeouts and Retries.

---

## Top violations (ranked by severity)

| Priority | Violation | Fix |
|----------|-----------|-----|
| 🔴 P0 | Duplicate `__tablename__` across BCs | Prefix every table: `{bc}_{entity}` |
| 🔴 P0 | Cross-BC DB session import | Use the BC's `Protocol` or HTTP client |
| 🟠 P1 | Fat router — business logic in route function | Move to service; routers ≤ 10 lines |
| 🟠 P1 | Repository injected into router | Inject services only |
| 🟠 P1 | SQLModel/SQLAlchemy syntax in service | Encapsulate in repository methods |
| 🟠 P1 | SDK import inside a service | Move to a client class in `http/client/` |
| 🟠 P1 | Cross-BC concrete class import (not Protocol) | Import `public_api` Protocol only |
| 🟡 P2 | `@Transactional` / `with session.begin()` missing on write | Add to all write operations |
| 🟡 P2 | Raw string instead of StrEnum | `MemberRole.GM` not `"gm"` |
| 🟡 P2 | No `__init__.py` missing check | Namespace packages — never add `__init__.py` |

---

## Pre-code checklist

Before writing or reviewing any BC code:

- [ ] Table names prefixed with BC name (`campaign_`, `wiki_`, etc.)
- [ ] No SQLModel table definitions imported from another BC
- [ ] Routers only inject services (not repositories)
- [ ] Services only use repository methods (no ORM operators)
- [ ] Write operations wrapped in `with session.begin()`
- [ ] SDK/external library imports only inside client classes (`http/client/`)
- [ ] Cross-BC calls go through `public_api` Protocol or HTTP client
- [ ] StrEnum used for all status/role/type fields
- [ ] No `__init__.py` files added

---

## Critical rules (summary)

Namespace packages (no `__init__.py`), Pydantic everywhere, no ORM in services, no repositories in routers, BC-prefixed tables, StrEnum for status fields, one transaction per write. Full patterns: **`docs/patterns/backend/`**.

---

## Build & run locally

```bash
# Backend
cd app/api
uv run uvicorn main:app --reload

# Frontend
cd app/web
npm run dev

# Backend tests
cd app/api
uv run pytest
```

Docker Compose is used for local dependencies (see repo root `docker-compose.yml`).
