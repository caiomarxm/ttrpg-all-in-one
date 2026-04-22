set shell := ["bash", "-eu", "-o", "pipefail", "-c"]

lint-backend:
  cd app/api && uv run ruff check .

format-backend:
  cd app/api && uv run ruff format .

test-backend:
  cd app/api && uv run pytest

dev-backend:
  set -a
  if [ -f .env.local ]; then . ./.env.local; fi
  set +a
  cd app/api && uv run uvicorn main:app --reload

lint-frontend:
  cd app/web && npm run lint

format-frontend:
  cd app/web && npm run format

test-frontend:
  cd app/web && npm test
