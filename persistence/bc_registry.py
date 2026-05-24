"""Bounded-context registry for the monorepo Alembic env (``persistence/migrations/env.py``)."""

from __future__ import annotations

import os
from collections.abc import Callable
from dataclasses import dataclass
from typing import Final

KNOWN_BOUNDED_CONTEXTS: Final[frozenset[str]] = frozenset(
    {"campaigns", "wiki", "session_transcription"}
)


@dataclass(frozen=True, slots=True)
class BcMigrationConfig:
    database_url: Callable[[], str]
    model_modules: tuple[str, ...]


def _campaigns_database_url() -> str:
    from modules.campaigns.config import CampaignsSettings

    return CampaignsSettings().database_url


def _wiki_database_url() -> str:
    return os.getenv(
        "WIKI_DATABASE_URL",
        "postgresql+psycopg://ttrpg:ttrpg@localhost:5432/wiki",
    )


def _session_transcription_database_url() -> str:
    from modules.session_transcription.config import get_session_transcription_settings

    return get_session_transcription_settings().DATABASE_URL


BC_REGISTRY: dict[str, BcMigrationConfig] = {
    "campaigns": BcMigrationConfig(
        database_url=_campaigns_database_url,
        model_modules=(),
    ),
    "wiki": BcMigrationConfig(
        database_url=_wiki_database_url,
        model_modules=(),
    ),
    "session_transcription": BcMigrationConfig(
        database_url=_session_transcription_database_url,
        model_modules=("modules.session_transcription.persistence.model.transcript",),
    ),
}


class UnknownBoundedContextError(ValueError):
    pass


def get_bc_config(name: str) -> BcMigrationConfig:
    if name not in BC_REGISTRY:
        raise UnknownBoundedContextError(
            f"Unknown bounded context {name!r}. Known: {sorted(BC_REGISTRY)}. "
            "Run alembic with -n <bc>."
        )
    return BC_REGISTRY[name]
