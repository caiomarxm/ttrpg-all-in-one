# Backend testing strategy & layout

How we test the modular monolith: scope, placement of tests, and how this ties to the BC module tree.

**BC package tree** (routers, services, `__test__` folders) is defined in **`module-design.md`** — read that when adding or renaming module directories. This doc focuses on **strategy** and **test-type conventions**.

---

## Philosophy

Ship safely by leaning on **automated tests**. Tests are the main lever for velocity: they document intent, catch regressions, and make refactors cheap.

Expectations:

| Scope | What it proves | Typical coverage |
|--------|----------------|------------------|
| **Unit** | Pure logic, services with collaborators mocked/faked | Every meaningful branch in services, domain rules, and helpers |
| **Integration** | One BC against its real persistence stack (DB, repos) where practical | Critical paths per bounded context |
| **End-to-end** | HTTP/API or cross-cutting journeys | Happy paths + high-value failure modes for the product |

Feature work should add or extend **unit** tests by default. New BC surfaces or persistence-heavy flows should add **integration** tests. **E2E** grows with user-visible flows and dual-purpose (frontend + agent) APIs.

---

## Directory layout

### Unit tests (colocated)

Place unit tests **next to the code under test**, under `__test__/unit/`:

```
modules/{bc}/core/service/
  campaign_service.py
  __test__/unit/
    test_campaign_service.py
```

Same pattern under other packages (`persistence/repository/`, `http/router/`, etc.) when you are testing that layer in isolation.

### Integration tests (per bounded context)

BC-scoped tests that exercise **repositories + DB + services** (no mocks for your own DB) live under the BC root:

```
modules/{bc}/__test__/integration/
  test_campaign_repository_integration.py
```

Keep these **inside the owning BC** so database and fixtures stay aligned with that BC’s migrations and config.

### E2E tests (BC or app)

BC-level API journeys (FastAPI app + real router stack for that module):

```
modules/{bc}/__test__/e2e/
```

App-wide or multi-BC flows may live under a dedicated app test package (e.g. `app/api/__test__/e2e/`) when you add them — keep **state isolation** in mind; prefer exercising contracts and HTTP boundaries over cross-BC DB joins in tests.

### Naming

- Test modules: `test_<thing>.py`
- Test functions: `test_<behavior>_<condition>()` (or your existing local style — stay consistent within a BC)

---

## Running tests

From the API package root (see repo `CLAUDE.md` for exact paths):

```bash
cd app/api
uv run pytest
```

Use markers or paths to narrow scope, e.g. `uv run pytest modules/campaigns/__test__/integration`.

---

## Frontend

React/Vite testing patterns will live under **`docs/patterns/frontend/`** when documented. Until then, favor colocated tests next to components/features and mirror BC names under `app/web/src/features/`.

---

## See also

| Topic | Document |
|--------|----------|
| Module folders, `public_api`, routers | `module-design.md` |
| Repositories, transactions, models | `data-layer.md` |
| Routers, DTOs | `api-layer.md` |
