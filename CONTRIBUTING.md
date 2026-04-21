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

Docker Compose for local Postgres and other infrastructure is tracked separately; when present, see the repo root **`docker-compose.yml`** (and beads issue for the Docker Compose task until it lands).
