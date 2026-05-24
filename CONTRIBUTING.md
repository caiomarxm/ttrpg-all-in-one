# Contributing

How to run the monorepo locally. **Product and design principles** live in **`docs/PRINCIPLES.md`**.

## Toolchain

- **Python 3.13.x** — see **`.python-version`**, **`.tool-versions`**, and **`app/api/pyproject.toml`** (`requires-python`). Use **asdf** / **uv** as you prefer; from `app/api` run `uv sync` (add `--extra dev` for pytest).
- **Node 24.x** — see **`.nvmrc`**. For **Cursor / VS Code** on Linux and macOS, **`.vscode/settings.json`** prepends **asdf shims** and the **nvm** Node bin to `PATH` so `npm` is available in integrated terminals.
- **Pylance / editor** — default interpreter: **`app/api/.venv/bin/python`** (after `uv sync`).

## Build and run

```bash
# Backend
cd app/api
uv sync --extra dev
uv run uvicorn main:app --reload

# Frontend
cd app/web
npm install   # first time / after dependency changes
npm run dev

# Backend tests
cd app/api
uv run pytest
```

Further API notes: **`app/api/README.md`**. Web app: **`app/web/README.md`**.

### Docker Compose (Postgres and infra)

Local infrastructure lives in **`docker-compose.yml`** at the repo root. Postgres is a **single** instance (`postgres` service) with **one database per bounded context**:

| Database | Env var (example) | Host (from host machine) |
|----------|-------------------|--------------------------|
| `campaigns` | `CAMPAIGNS_DATABASE_URL` | `localhost:5432` |
| `wiki` | `WIKI_DATABASE_URL` | `localhost:5432` |
| `session_transcription` | `SESSION_TRANSCRIPTION_DATABASE_URL` | `localhost:5432` |

Default credentials (dev only): user `ttrpg`, password `ttrpg`. Override the published port with `POSTGRES_PORT` (default `5432`).

BC databases are created on first boot via `infra/postgres/init-databases.sql`. Migration **scripts** live under each module (`app/api/modules/<bc>/persistence/migration/versions/`); the shared Alembic config is at **`persistence/alembic.ini`**.

```bash
docker compose up -d postgres
just migrate-bc session_transcription   # or: just migrate-all
```

With the full stack, a one-shot **`migrate`** service runs Alembic before **`api`** starts (`restart: "no"` — exits after success). Re-run manually: `docker compose run --rm migrate`.

New revision for a BC (from `app/api/`):

```bash
uv run alembic -c ../../persistence/alembic.ini -n session_transcription revision -m "describe change" --autogenerate
```

From inside Compose, the API uses hostname `postgres` (see `SESSION_TRANSCRIPTION_DATABASE_URL` on the `api` service).
