set shell := ["bash", "-eu", "-o", "pipefail", "-c"]

# Start all services (API infra + Discord bot) via Docker Compose
run:
  docker compose down && docker compose up --build -d

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

lint-bot:
  cd services/discord_bot && uv run ruff check .

format-bot:
  cd services/discord_bot && uv run ruff format .

test-bot:
  cd services/discord_bot && uv run pytest tests/ -v

test-bot-unit:
  cd services/discord_bot && uv run pytest tests/unit/ -v
