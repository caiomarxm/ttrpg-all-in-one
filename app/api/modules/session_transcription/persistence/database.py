from collections.abc import Iterator
from functools import lru_cache

from sqlalchemy.engine import Engine
from sqlmodel import Session, create_engine

from modules.session_transcription.config import get_session_transcription_settings


@lru_cache
def get_session_transcription_engine() -> Engine:
    settings = get_session_transcription_settings()
    return create_engine(settings.DATABASE_URL, pool_pre_ping=True)


def get_session_transcription_session() -> Iterator[Session]:
    with Session(get_session_transcription_engine()) as session:
        yield session
