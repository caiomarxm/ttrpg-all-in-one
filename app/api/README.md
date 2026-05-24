# TTRPG API

Modular FastAPI service. Bounded contexts live under `modules/<bc>/` with the layout in `docs/patterns/backend/module-design.md`.

Scaffolded BCs: **`campaigns`** (includes `CampaignsPublicApi` + `MemberRole`), **`iam`**. Placeholder routes: `GET /campaigns`, `GET /iam`.

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

One Alembic setup at repo root: **`persistence/alembic.ini`**. Revision files live in each BC under `modules/<bc>/persistence/migration/versions/`.

Always pass **`-n <bc>`** (bounded context name). From **`app/api/`**:

```bash
uv run alembic -c ../../persistence/alembic.ini -n session_transcription upgrade head
```

Or from repo root: `just migrate-bc session_transcription`.

Autogenerate a new revision:

```bash
uv run alembic -c ../../persistence/alembic.ini -n session_transcription revision -m "describe change" --autogenerate
```

See **`CONTRIBUTING.md`** for Postgres layout and `just migrate-all`.

## Tests

```bash
uv sync --extra dev
uv run pytest
```

Smoke tests live under **`__test__/`** at the API root; BC-scoped tests follow `docs/patterns/backend/testing.md`.
