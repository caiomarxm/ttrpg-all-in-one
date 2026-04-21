# Project Instructions for AI Agents

This file provides instructions and context for AI coding agents working on this project.

<!-- BEGIN BEADS INTEGRATION v:1 profile:minimal hash:ca08a54f -->
## Beads Issue Tracker

This project uses **bd (beads)** for issue tracking. Run `bd prime` to see full workflow context and commands.

### Quick Reference

```bash
bd ready              # Find available work
bd show <id>          # View issue details
bd update <id> --claim  # Claim work
bd close <id>         # Complete work
```

### Rules

- Use `bd` for ALL task tracking — do NOT use TodoWrite, TaskCreate, or markdown TODO lists
- Run `bd prime` for detailed command reference and session close protocol
- Use `bd remember` for persistent knowledge — do NOT use MEMORY.md files

## Session Completion

**When ending a work session**, you MUST complete ALL steps below. Work is NOT complete until `git push` succeeds.

**MANDATORY WORKFLOW:**

1. **File issues for remaining work** - Create issues for anything that needs follow-up
2. **Run quality gates** (if code changed) - Tests, linters, builds
3. **Update issue status** - Close finished work, update in-progress items
4. **PUSH TO REMOTE** - This is MANDATORY:
   ```bash
   git pull --rebase
   bd dolt push
   git push
   git status  # MUST show "up to date with origin"
   ```
5. **Clean up** - Clear stashes, prune remote branches
6. **Verify** - All changes committed AND pushed
7. **Hand off** - Provide context for next session

**CRITICAL RULES:**
- Work is NOT complete until `git push` succeeds
- NEVER stop before pushing - that leaves work stranded locally
- NEVER say "ready to push when you are" - YOU must push
- If push fails, resolve and retry until it succeeds
<!-- END BEADS INTEGRATION -->


## Philosophy

**Ship fast by relying on automated tests.** Every feature needs unit tests, every bounded context needs integration tests, and the system needs automated e2e tests. Tests are the primary enabler of velocity.

**Modular monolith pattern** for both backend and frontend. Each module is a bounded context (DDD). No microservices — services are intentionally large and self-contained. Reference architecture: `/home/caiomarxm/personal/projects/fakeflix`.

**Backend**: FastAPI + SQLModel. Modules live in `app/api/modules/`. Apps are thin bootstrap orchestrators. State isolation is critical — no shared models across modules.

**Frontend**: React + Vite. Feature-based, mirrors backend bounded contexts. Lives in `app/web/`.

**APIs are dual-purpose**: Every API must serve both the frontend and the AI agent (tool calls). Design with this in mind from day one.

---

## Architecture Principles

10 principles that govern every decision in this codebase:

1. **Well-defined boundaries** — each BC has exclusive data ownership and a clear ubiquitous language
2. **Composability** — modules can be combined in different apps without modification
3. **Independence** — each module has its own database, config, and tests
4. **Individual scale** — modules scale independently without affecting others
5. **Explicit communication** — BCs talk via Protocols and HTTP clients; no hidden dependencies
6. **Replaceability** — modules can be swapped (e.g. AnthropicAdapter ↔ OpenAIAdapter)
7. **Deployment independence** — module boundaries are strict enough to extract to a microservice
8. **State isolation** ⚠️ **CRITICAL** — no shared DB tables, no cross-BC foreign keys, no cross-BC session imports
9. **Observability** — structured logging with module context on every service operation
10. **Fail independence** — one module's failure must not cascade to others; use graceful degradation

---

## Project Structure

```
app/
  api/
    modules/         ← all bounded context modules
      shared/        ← base classes, auth, logger, http client
      iam/
      campaigns/
      wiki/
      compendium/
      characters/
      assets/
      maps/
      session/
      assistant/
    main.py          ← FastAPI bootstrap, mounts all routers
    pyproject.toml
  web/
    src/
      features/      ← mirrors BC names
      shared/
    package.json
docker-compose.yml
docs/
  SCOPE.md
  ARCHITECTURE.md
  CODING-PATTERNS.md      ← read this when writing services, repos, routers
  INTEGRATION-PATTERNS.md ← read this when integrating external services
```

### Module internal structure

```
modules/{bc}/
  core/
    service/         ← business logic
    interface/       ← Protocols for cross-BC communication
    enum/
  persistence/
    model/           ← SQLModel table definitions (table=True)
    repository/      ← BaseRepository subclasses
    migration/versions/
  http/
    router/          ← FastAPI APIRouter functions (lean, ~10 lines each)
    dto/
      request/       ← Pydantic request schemas
      response/      ← Pydantic response schemas
    client/          ← external API/SDK clients
  public_api/        ← Protocol exposed to other BCs
  __test__/e2e/
  config.py          ← Pydantic BaseSettings, env prefix = BC_NAME_
  router.py          ← aggregates sub-routers, imported by main.py
```

Unit tests live alongside the file they test:
```
core/service/
  campaign_service.py
  __test__/unit/
    test_campaign_service.py
```

---

## 📚 Progressive Documentation Loading

**CRITICAL**: Only load documents relevant to your current task. Do NOT load all docs at once.

### Decision Tree

**Writing backend code:**
- Service, repository, model, or migration → `docs/patterns/backend/data-layer.md`
- FastAPI router, DTO, DI, Pydantic schema, or enum → `docs/patterns/backend/api-layer.md`
- New BC, module boundaries, cross-BC communication, or naming → `docs/patterns/backend/module-design.md`
- External HTTP API, SDK, AI provider, logging, or resilience → `docs/patterns/backend/integrations.md`

**Writing frontend code:**
- _React patterns coming soon — see `docs/patterns/frontend/` when available_

**Architecture / design tasks:**
- BC scope, data ownership, or bounded context definitions → `docs/SCOPE.md`
- Tech stack, infra, or storage decisions → `docs/ARCHITECTURE.md`

### Quick Reference

| Task | Doc | Section |
|---|---|---|
| New SQLModel model | `data-layer.md` | Model Naming and State Isolation |
| New repository | `data-layer.md` | Repository Pattern |
| Write operation | `data-layer.md` | Transaction Management |
| New FastAPI router | `api-layer.md` | Lean Router Pattern |
| New Pydantic schema or config | `api-layer.md` | Pydantic-First Validation |
| Enum definition | `api-layer.md` | Enum Usage |
| New BC or module | `module-design.md` | Module Structure |
| Cross-BC communication | `module-design.md` | Cross-BC Communication Rules |
| Public API surface | `module-design.md` | Public API — Protocol as Cross-BC Contract |
| Naming anything | `module-design.md` | Naming Conventions |
| External HTTP/SDK client | `integrations.md` | External API Client Encapsulation |
| AI provider adapter | `integrations.md` | AI Provider Port Pattern |
| Structured logging | `integrations.md` | Structured Logging |
| Circuit breaker / retry | `integrations.md` | Circuit Breakers, Timeouts and Retries |

---

## Critical Rules for Agents

- **No `__init__.py` files** — namespace packages only
- **Pydantic everywhere** — all DTOs, all config, all external response types
- **No ORM in services** — SQLAlchemy/SQLModel syntax only in repositories
- **No repositories in routers** — inject services only
- **BC-prefixed table names** — `campaign_member`, not `member`
- **No cross-BC DB access** — use Protocols or HTTP clients
- **StrEnum for all status/role/type fields** — never raw strings
- **One transaction per write operation** — use `with session.begin()`

## Build & Test

```bash
# Backend
cd app/api
uv run uvicorn main:app --reload

# Frontend
cd app/web
npm run dev

# Tests (backend)
cd app/api
uv run pytest
```
