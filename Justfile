set shell := ["bash", "-eu", "-o", "pipefail", "-c"]

lint-backend:
  cd app/api && uv run ruff check .

format-backend:
  cd app/api && uv run ruff format .

dev-backend:
  cd app/api && uv run uvicorn main:app --reload
