# Data Layer Patterns

Repository pattern, ORM encapsulation, model naming, and transaction management.

All paths relative to `app/api/`.

---

## Repository Pattern & ORM Encapsulation

Repositories MUST encapsulate all ORM-specific logic. Services never touch SQLAlchemy/SQLModel query syntax.

**Rules:**
- ✅ Extend `BaseRepository[Model]` from `modules/shared/module/database` for all repositories
- ✅ Inject `Session` via `Depends(get_{bc}_session)` — never import a session globally
- ✅ Add query methods with business-meaningful names
- ❌ Never expose `select()`, `filter()`, or raw SQLAlchemy to services
- ❌ Never call `session.exec()` or `session.get()` from services directly

`BaseRepository` wraps the SQLModel `Session` as a private property and exposes only: `save`, `find_one`, `find`, `find_one_by_id`, `exists`, `delete`.

```python
# ✅ GOOD
class CampaignRepository(BaseRepository[Campaign]):
    def __init__(self, session: Session = Depends(get_campaigns_session)):
        super().__init__(Campaign, session)

    def find_active_by_owner_id(self, owner_id: str) -> list[Campaign]:
        return self.find(owner_id=owner_id, status=CampaignStatus.ACTIVE)

    def find_by_slug(self, slug: str) -> Campaign | None:
        return self.find_one(slug=slug)

# ❌ BAD: service coupled to SQLModel query syntax
class SomeService:
    def get_campaigns(self, owner_id: str):
        stmt = select(Campaign).where(Campaign.owner_id == owner_id)
        return self.session.exec(stmt).all()
```

### Method naming — express business intent, not ORM mechanics

```python
# ✅ Good
find_active_by_owner_id_with_members(owner_id)
find_pending_invitations_by_user_and_campaign(user_id, campaign_id)

# ❌ Bad
find_one_with_relations(id, relations)
query_with_where_clause(params)
```

---

## ORM Leakage Prevention

**Rules:**
- ✅ All `select()`, `where()`, `options()`, relationship loading — only in repositories
- ✅ SQLAlchemy/SQLModel imports only in repository and model files
- ❌ Never import `col`, `and_`, `or_`, `selectinload`, or similar in services

```python
# ❌ BAD: service importing and using ORM operators
from sqlmodel import select, col

class CampaignService:
    def get_active(self, owner_id: str):
        stmt = select(Campaign).where(col(Campaign.owner_id) == owner_id)
        return self.session.exec(stmt).all()

# ✅ GOOD: repository hides all of that
class CampaignRepository(BaseRepository[Campaign]):
    def find_active_by_owner_id_with_members(self, owner_id: str) -> list[Campaign]:
        stmt = (
            select(Campaign)
            .where(Campaign.owner_id == owner_id)
            .where(Campaign.status == CampaignStatus.ACTIVE)
            .options(selectinload(Campaign.members))
        )
        return list(self.session.exec(stmt).all())

# Service call is clean — zero ORM imports
campaigns = self.campaign_repo.find_active_by_owner_id_with_members(owner_id)
```

---

## Model Naming and State Isolation

⚠️ **CRITICAL**: Table names MUST be prefixed with the BC name.

**Rules:**
- ✅ Each BC has its own database (separate Cloud SQL instance)
- ✅ Prefix ALL `__tablename__` values with the BC name: `campaign_member`, not `member`
- ✅ Use domain events or public API Protocols for cross-BC data needs
- ❌ Never duplicate table names across BCs — even across separate databases (for clarity)
- ❌ Never share database connections between BCs
- ❌ Never use SQLModel `Relationship` that crosses BC boundaries

```python
# ❌ CRITICAL VIOLATION: ambiguous table name
class Member(BaseModel, table=True):
    __tablename__ = "member"  # conflicts conceptually with wiki_contributor, session_participant, etc.

# ✅ CORRECT: BC-prefixed table names
class CampaignMember(BaseModel, table=True):
    __tablename__ = "campaign_member"

class WikiContributor(BaseModel, table=True):
    __tablename__ = "wiki_contributor"

class SessionParticipant(BaseModel, table=True):
    __tablename__ = "session_participant"
```

**String references instead of cross-BC foreign keys:**

```python
# ❌ BAD: FK to another BC's table (impossible anyway — different DB)
class WikiDocument(BaseModel, table=True):
    campaign_id: str = Field(foreign_key="campaign.id")  # ❌ cross-DB FK

# ✅ GOOD: plain string reference, enforced at the application layer
class WikiDocument(BaseModel, table=True):
    __tablename__ = "wiki_document"
    campaign_id: str  # string reference — no FK constraint
```

---

## Transaction Management

Services performing write operations MUST wrap them in a transaction.

**Rules:**
- ✅ Use `with self.session.begin():` for all methods that write
- ✅ Apply to any method that orchestrates multiple writes
- ❌ Never wrap read-only methods in a transaction
- ❌ Never nest `session.begin()` blocks

```python
# ❌ BAD: two writes without atomicity
def add_member(self, campaign_id: str, user_id: str):
    member = self.member_repo.save(CampaignMember(campaign_id=campaign_id, user_id=user_id))
    campaign = self.campaign_repo.find_one_by_id(campaign_id)
    campaign.member_count += 1
    self.campaign_repo.save(campaign)  # if this fails, member is saved but count is wrong

# ✅ GOOD: atomic
def add_member(self, campaign_id: str, user_id: str) -> CampaignMember:
    with self.session.begin():
        member = self.member_repo.save(CampaignMember(campaign_id=campaign_id, user_id=user_id))
        campaign = self.campaign_repo.find_one_by_id(campaign_id)
        campaign.member_count += 1
        self.campaign_repo.save(campaign)
    return member

# ✅ Read-only — no transaction needed
def get_campaign(self, campaign_id: str) -> Campaign:
    return self.campaign_repo.find_one_by_id(campaign_id)
```

---

## Database Configuration

Each BC owns its own engine and session factory. Never share an engine across BCs.

```python
# modules/campaigns/persistence/database.py
from sqlmodel import create_engine, Session
from functools import lru_cache
from modules.campaigns.config import get_campaigns_config

@lru_cache
def get_engine():
    return create_engine(get_campaigns_config().database_url)

def get_campaigns_session():
    with Session(get_engine()) as session:
        yield session
```

**BC-prefixed environment variables:**

```bash
CAMPAIGNS_DATABASE_URL=postgresql://user:pass@host/campaigns_db
WIKI_DATABASE_URL=postgresql://user:pass@host/wiki_db
IAM_DATABASE_URL=postgresql://user:pass@host/iam_db
```

Same host is fine; different database is required.
