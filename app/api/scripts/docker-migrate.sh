#!/bin/sh
# One-shot migrations for Compose (service: migrate). Exits 0 when all BCs are at head.
set -eu

ALEMBIC="/workspace/app/api/.venv/bin/alembic"
CONFIG="/workspace/persistence/alembic.ini"

# Add BC names here as revision folders appear under modules/<bc>/persistence/migration/versions/
for bc in session_transcription; do
  echo "[migrate] upgrading ${bc}..."
  "$ALEMBIC" -c "$CONFIG" -n "$bc" upgrade head
done

echo "[migrate] done"
