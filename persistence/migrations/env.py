"""Alembic env — run with config at repo ``persistence/alembic.ini``.

``prepend_sys_path`` plus the path tweak below ensures BC SQLModel tables register on ``SQLModel.metadata``.
"""

from __future__ import annotations

import sys
from pathlib import Path

_REPO_ROOT = Path(__file__).resolve().parents[2]
_API_ROOT = _REPO_ROOT / "app" / "api"
# Ensures SQLite path in alembic.ini works until Postgres + Docker Compose replaces it.
_PERSIST_VAR = Path(__file__).resolve().parents[1] / "var"
_PERSIST_VAR.mkdir(parents=True, exist_ok=True)
if str(_API_ROOT) not in sys.path:
    sys.path.insert(0, str(_API_ROOT))

from logging.config import fileConfig

from alembic import context
from sqlalchemy import engine_from_config, pool
from sqlmodel import SQLModel

config = context.config

if config.config_file_name is not None:
    fileConfig(config.config_file_name)

target_metadata = SQLModel.metadata


def run_migrations_offline() -> None:
    url = config.get_main_option("sqlalchemy.url")
    context.configure(
        url=url,
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
    )

    with context.begin_transaction():
        context.run_migrations()


def run_migrations_online() -> None:
    connectable = engine_from_config(
        config.get_section(config.config_ini_section, {}),
        prefix="sqlalchemy.",
        poolclass=pool.NullPool,
    )

    with connectable.connect() as connection:
        context.configure(connection=connection, target_metadata=target_metadata)

        with context.begin_transaction():
            context.run_migrations()


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
