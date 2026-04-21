# TTRPG API

Modular FastAPI service. Bounded contexts live under `modules/<bc>/` (namespace packages; no `__init__.py`).

## Run (repo root)

```bash
uv sync
uv run uvicorn main:app --app-dir app/api --reload
```

Then open `GET http://127.0.0.1:8000/health`.

## Alembic (shared BC migrations)

From repo root, with `cwd` implicit via `-c`:

```bash
uv run alembic -c app/api/alembic.ini upgrade head
```
