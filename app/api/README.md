# TTRPG API

Modular FastAPI service. Bounded contexts live under `modules/<bc>/` with the layout in `docs/patterns/backend/module-design.md`.

Scaffolded BCs: **`campaigns`** (includes `CampaignsPublicApi` + `MemberRole`), **`iam`**. Placeholder routes: `GET /campaigns`, `GET /iam`.

Alembic config lives under **`persistence/`** at the **repository root** (not inside `app/api/`).

**Database direction:** **SQLite** is intended **only for in-memory test fixtures** (`docs/patterns/backend/testing.md`). **PostgreSQL** for local development will be introduced with the **Docker Compose** task (not wired here yet). Until then, file-based SQLite under `persistence/var/` may remain as a short-lived bootstrap — replace with Compose-driven Postgres URLs when that task lands.

## Run

From **`app/api/`** (where `pyproject.toml` lives):

```bash
uv sync --extra dev   # pytest + httpx for tests
uv run uvicorn main:app --reload
```

From repo root:

```bash
uv sync --directory app/api
uv run --directory app/api uvicorn main:app --reload
```

Then open `GET http://127.0.0.1:8000/health`.

## Alembic

Monorepo Alembic config: **`persistence/alembic.ini`**. Local SQLite files (provisional): **`persistence/var/`** (gitignored).

BC-specific migrations under each module’s `persistence/migration/` still apply per `module-design.md`; this tree is for shared bootstrap / glue only.

From **`app/api/`**:

```bash
uv run alembic -c ../../persistence/alembic.ini upgrade head
```

Build artifacts such as **`ttrpg_api.egg-info/`** are produced next to `pyproject.toml` during `uv sync`; they are listed in `.gitignore` and safe to delete locally.

## Tests

```bash
uv sync --extra dev
uv run pytest
```

Smoke tests live under **`__test__/`** at the API root; BC-scoped tests follow `docs/patterns/backend/testing.md`.
