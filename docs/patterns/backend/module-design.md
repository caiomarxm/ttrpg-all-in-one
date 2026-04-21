# Module Design Patterns

Module boundaries, cross-BC communication, public API surface, and naming conventions.

All paths relative to `app/api/`.

---

## Module Structure

Each BC is a self-contained directory under `modules/`. No shared state, no shared DB, no cross-imports of internals.

```
modules/{bc}/
  core/
    service/         ← business logic — orchestrates repositories and clients
    enum/            ← StrEnum definitions
  persistence/
    model/           ← SQLModel table=True definitions
    repository/      ← BaseRepository subclasses
    migration/
      versions/      ← Alembic migration files
  http/
    router/          ← FastAPI APIRouter functions (lean)
    dto/
      request/       ← Pydantic request schemas
      response/      ← Pydantic response schemas
    client/          ← HTTP/SDK clients for external APIs
  public_api/        ← Protocol exposed to other BCs (the only cross-BC import surface)
  __test__/
    integration/     ← BC-scoped DB + service integration tests
    e2e/             ← BC-level API / workflow tests
  config.py          ← Pydantic BaseSettings, env prefix = {BC}_
  router.py          ← aggregates sub-routers, imported by main.py
```

### `modules/shared/` — not a bounded context

`modules/shared/` is **only** for tiny, dependency-light helpers reused by multiple BCs (pure functions, constants, trivial types). It **must not** mirror the BC layout above — no `core/`, `http/`, `persistence/`, `router.py`, `public_api/`, migrations, or SQLModel models. Anything with HTTP entrypoints, a database, or cross-BC contracts belongs in a real BC (or in `iam/` for auth plumbing).

**Testing strategy** (what each layer should prove, naming, running pytest) lives in **`testing.md`**. This section only defines **where** folders live.

Unit tests live alongside the file they test:

```
core/service/
  campaign_service.py
  __test__/unit/
    test_campaign_service.py
```

---

## Public API — Protocol as the Cross-BC Contract

Each BC exposes a `Protocol` in `public_api/` that defines exactly what other BCs are allowed to call. Internal services, repositories, and models are never imported outside the BC.

```python
# modules/campaigns/public_api/campaigns_public_api.py
from typing import Protocol
from modules.campaigns.core.enum.campaign_enum import MemberRole

class CampaignsPublicApi(Protocol):
    async def get_user_role(self, campaign_id: str, user_id: str) -> MemberRole: ...
    async def is_member(self, campaign_id: str, user_id: str) -> bool: ...
```

The service implements the Protocol implicitly (structural subtyping):

```python
# modules/campaigns/core/service/campaign_service.py
class CampaignService:
    async def get_user_role(self, campaign_id: str, user_id: str) -> MemberRole: ...
    async def is_member(self, campaign_id: str, user_id: str) -> bool: ...
```

Other BCs depend on the Protocol — never on `CampaignService` directly:

```python
# modules/wiki/core/service/wiki_service.py
from modules.campaigns.public_api.campaigns_public_api import CampaignsPublicApi

class WikiService:
    def __init__(self, campaigns: CampaignsPublicApi): ...

# ❌ BAD: importing the concrete service from another BC
from modules.campaigns.core.service.campaign_service import CampaignService  # ❌
```

---

## Cross-BC Communication Rules

BCs communicate through Protocols (in-process, same app) or HTTP clients (future microservice extraction). Never via shared DB access.

```python
# ❌ BAD: importing another BC's session or repository
from modules.campaigns.persistence.database import get_campaigns_session  # ❌ in wiki

# ✅ GOOD: call via the Protocol
class WikiService:
    def __init__(self, campaigns: CampaignsPublicApi):
        self.campaigns = campaigns

    async def get_document(self, campaign_id: str, doc_id: str, user_id: str):
        role = await self.campaigns.get_user_role(campaign_id, user_id)
        # use role for authorization
```

When a BC needs data that belongs to another BC, it uses string references (no FK):

```python
class WikiDocument(BaseModel, table=True):
    __tablename__ = "wiki_document"
    campaign_id: str  # string reference — no DB-level FK, enforced in service layer
```

---

## Naming Conventions

| Category | Convention | Examples |
|---|---|---|
| Folders | snake_case | `core/service`, `http/router`, `public_api` |
| Files | snake_case with suffix | `campaign_service.py`, `campaign_router.py` |
| Classes | PascalCase | `CampaignService`, `CampaignRepository` |
| Cross-BC Protocols | PascalCase ending in `PublicApi` | `CampaignsPublicApi`, `WikiPublicApi` |
| Enums | PascalCase | `MemberRole`, `CampaignStatus` |
| Functions / methods | snake_case | `get_campaign`, `find_active_by_owner_id` |
| Variables | snake_case | `campaign_id`, `campaign_service` |
| Constants | UPPER_SNAKE_CASE | `MAX_MEMBERS`, `DEFAULT_PAGE_SIZE` |
| Env variables | UPPER_SNAKE_CASE with BC prefix | `CAMPAIGNS_DATABASE_URL`, `WIKI_MAX_DOCUMENT_SIZE` |
| Pydantic Settings fields | snake_case | `database_url`, `firebase_project_id` |
| Table names | bc_name + entity_name (snake_case) | `campaign_member`, `wiki_document`, `iam_permission` |
| Session dependency | `get_{bc}_session` | `get_campaigns_session`, `get_wiki_session` |

---

## Common Anti-Patterns

| Anti-Pattern | Fix |
|---|---|
| SQLAlchemy `select()` / `where()` in services | Encapsulate in repository methods |
| Repository injected into router | Inject services only |
| Router function > 15 lines with conditions | Move logic to service |
| Transaction on a read-only method | Remove — reads don't need transactions |
| `__tablename__` without BC prefix | Prefix: `campaign_member`, not `member` |
| Cross-BC session import | Use the BC's `public_api/` Protocol or HTTP client |
| Importing `CampaignService` from another BC | Import `CampaignsPublicApi` Protocol instead |
| Raw string `"gm"` / `"active"` instead of enum | `MemberRole.GM` / `CampaignStatus.ACTIVE` |
| `dict` or `dataclass` for request/response | Use Pydantic `BaseModel` |
| SDK import inside a service | Move to a client class in `http/client/` |
| Raw SDK types leaking into services | Wrap in Pydantic inside the client class |
