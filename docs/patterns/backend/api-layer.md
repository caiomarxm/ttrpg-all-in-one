# API Layer Patterns

FastAPI routers, DTOs, dependency injection, Pydantic validation, and enum usage.

All paths relative to `app/api/`.

---

## Lean Router Pattern

Routers handle HTTP concerns only. All business logic lives in services.

**Rules:**
- ✅ Keep router functions under ~15 lines
- ✅ Only inject services (never repositories)
- ✅ Only handle: path/query/body extraction, user context, service call, response mapping
- ❌ Never put business logic in router functions
- ❌ Never inject repositories directly into router functions
- ❌ Never perform calculations or conditional logic beyond simple mapping

**Router responsibilities:**
1. Extract path params, query params, request body
2. Extract current user via `Depends(get_current_user)`
3. Call one service method
4. Return a Pydantic response schema

```python
# ✅ GOOD: lean router (~10 lines)
router = APIRouter(prefix="/campaigns", tags=["campaigns"])

@router.get("/{campaign_id}", response_model=CampaignResponse)
async def get_campaign(
    campaign_id: str,
    current_user: CurrentUser = Depends(get_current_user),
    service: CampaignService = Depends(get_campaign_service),
) -> CampaignResponse:
    campaign = await service.get_campaign(campaign_id, current_user.id)
    return CampaignResponse.model_validate(campaign)

# ❌ BAD: fat router with logic and direct repo access
@router.get("/{campaign_id}/members")
async def get_members(
    campaign_id: str,
    repo: MemberRepository = Depends(get_member_repo),  # ❌ repo in router
):
    members = repo.find_by_campaign_id(campaign_id)     # ❌ business logic here
    return [m for m in members if not m.deleted_at]     # ❌ filtering in router
```

**Service vs Router responsibilities:**

| Responsibility | Service | Router |
|---|---|---|
| Business logic | ✅ | ❌ |
| Repository calls | ✅ | ❌ |
| Calculations | ✅ | ❌ |
| Request validation (Pydantic) | ❌ | ✅ |
| HTTP status codes | ❌ | ✅ |
| Response mapping (Model → Schema) | ❌ | ✅ |
| User context extraction | ❌ | ✅ |

---

## Dependency Injection

Service factory functions live in the router file (or a `dependencies.py` in the BC for reuse). Never instantiate services inline.

```python
# modules/campaigns/http/router/campaign_router.py

def get_campaign_service(
    session: Session = Depends(get_campaigns_session),
) -> CampaignService:
    repo = CampaignRepository(session)
    return CampaignService(repo)

@router.post("/", response_model=CampaignResponse, status_code=201)
async def create_campaign(
    body: CreateCampaignRequest,
    current_user: CurrentUser = Depends(get_current_user),
    service: CampaignService = Depends(get_campaign_service),
) -> CampaignResponse:
    campaign = await service.create_campaign(body.name, current_user.id)
    return CampaignResponse.model_validate(campaign)
```

**Rules:**
- ✅ Session injected via `Depends(get_{bc}_session)` — scoped to the BC
- ✅ Services are instantiated fresh per request via factory functions
- ✅ Factory functions can be reused across routers by moving them to `dependencies.py`
- ❌ Never use module-level service singletons

---

## Pydantic-First Validation

Use Pydantic for ALL data entering or leaving the system.

**Rules:**
- ✅ All request bodies and response shapes are `pydantic.BaseModel`
- ✅ All BC config is `pydantic_settings.BaseSettings` with a BC-prefixed env prefix
- ✅ External API and SDK responses are wrapped in Pydantic models at the client boundary
- ✅ `SQLModel` (Pydantic-based) for DB table definitions
- ❌ Never use plain `dict` or `dataclass` where a Pydantic model fits
- ❌ Never let raw SDK/third-party types leak into services

```python
# ✅ Request schema
class CreateCampaignRequest(BaseModel):
    name: str = Field(min_length=1, max_length=100)
    description: str | None = None

# ✅ Response schema — model_validate maps from SQLModel
class CampaignResponse(BaseModel):
    id: str
    name: str
    owner_id: str
    status: CampaignStatus
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)

# ✅ BC config
class CampaignsConfig(BaseSettings):
    database_url: PostgresDsn
    max_members_per_campaign: int = 20

    model_config = SettingsConfigDict(env_prefix="CAMPAIGNS_")
```

---

## Enum Usage

Always use `StrEnum` members — never raw strings for finite, named sets of values.

**Rules:**
- ✅ Define all status/role/type fields as `StrEnum`
- ✅ Use enum members everywhere: `CampaignStatus.ACTIVE`, `MemberRole.GM`
- ✅ Use the enum as the field type — never `str` when an enum applies
- ❌ Never use raw string literals where an enum exists (`"active"`, `"gm"`)
- ❌ Never cast strings to enums to silence a type error (`CampaignStatus(raw)`)

```python
from enum import StrEnum

class CampaignStatus(StrEnum):
    ACTIVE = "active"
    ARCHIVED = "archived"

class MemberRole(StrEnum):
    GM = "gm"
    PLAYER = "player"

# ❌ BAD
member = CampaignMember(role="gm")
if campaign.status == "active":
    ...

# ✅ GOOD
member = CampaignMember(role=MemberRole.GM)
if campaign.status == CampaignStatus.ACTIVE:
    ...
```

`StrEnum` values serialize naturally to strings — no custom JSON encoder needed, no extra ORM mapping.

This rule applies equally to test files. Factory helpers and fixture data must use enum members, not string literals.
