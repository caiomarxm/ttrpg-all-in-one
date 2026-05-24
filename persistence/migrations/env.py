"""Alembic env — one setup for all BCs. Run from ``app/api``:

``uv run alembic -c ../../persistence/alembic.ini -n session_transcription upgrade head``
"""

from __future__ import annotations

import importlib
import sys
from logging.config import fileConfig
from pathlib import Path

from alembic import context
from sqlalchemy import engine_from_config, pool
from sqlmodel import SQLModel

_PERSISTENCE_ROOT = Path(__file__).resolve().parents[1]
_REPO_ROOT = _PERSISTENCE_ROOT.parent
_API_ROOT = _REPO_ROOT / "app" / "api"

for path in (_API_ROOT, _PERSISTENCE_ROOT):
    if str(path) not in sys.path:
        sys.path.insert(0, str(path))

from bc_registry import get_bc_config  # noqa: E402

config = context.config

if config.config_file_name is not None:
    fileConfig(config.config_file_name)

_section = config.config_ini_section
if _section == "alembic":
    raise RuntimeError(
        "Specify a bounded context with -n, e.g. "
        "alembic -c persistence/alembic.ini -n session_transcription upgrade head"
    )

_bc = get_bc_config(_section)
config.set_main_option("sqlalchemy.url", _bc.database_url())

for _module in _bc.model_modules:
    importlib.import_module(_module)

target_metadata = SQLModel.metadata


def run_migrations_offline() -> None:
    context.configure(
        url=_bc.database_url(),
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
    )

    with context.begin_transaction():
        context.run_migrations()


def run_migrations_online() -> None:
    configuration = config.get_section(config.config_ini_section, {})
    configuration["sqlalchemy.url"] = _bc.database_url()
    connectable = engine_from_config(
        configuration,
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
