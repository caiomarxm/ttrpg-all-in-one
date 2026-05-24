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

migrate-bc bc:
  cd app/api && uv run alembic -c ../../persistence/alembic.ini -n {{bc}} upgrade head

migrate-all:
  just migrate-bc session_transcription

migrate-session-transcription:
  just migrate-bc session_transcription

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
  cd app/discord/cronista && uv run ruff check .

format-bot:
  cd app/discord/cronista && uv run ruff format .

test-bot:
  cd app/discord/cronista && uv run pytest tests/ -v

test-bot-unit:
  cd app/discord/cronista && uv run pytest tests/unit/ -v

test-recorder:
  cd app/discord/escriba && npm test

test:
  just test-backend
  just test-recorder
  just test-bot-unit

build-recorder:
  cd app/discord/escriba && npm run build
