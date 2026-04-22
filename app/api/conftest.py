from __future__ import annotations

import os
from collections.abc import AsyncIterator, Iterator

import pytest
import pytest_asyncio
from sqlalchemy.ext.asyncio import AsyncEngine, AsyncSession, async_sessionmaker, create_async_engine
from sqlmodel import Session, SQLModel, create_engine
from sqlmodel.pool import StaticPool

from modules.shared.__test__.unit._models import SharedTestItem  # noqa: F401


@pytest.fixture()
def sqlite_engine():
    _ = SharedTestItem
    engine = create_engine(
        "sqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    SQLModel.metadata.create_all(engine)
    try:
        yield engine
    finally:
        engine.dispose()


@pytest.fixture()
def sqlite_session(sqlite_engine) -> Iterator[Session]:
    with Session(sqlite_engine) as session:
        yield session


def _e2e_database_url() -> str | None:
    return os.getenv("E2E_DATABASE_URL")


@pytest.fixture(scope="session")
def postgres_async_engine() -> Iterator[AsyncEngine | None]:
    url = _e2e_database_url()
    if not url:
        yield None
        return

    _ = SharedTestItem
    engine = create_async_engine(url)
    SQLModel.metadata.create_all(engine.sync_engine)
    try:
        yield engine
    finally:
        SQLModel.metadata.drop_all(engine.sync_engine)
        engine.dispose()


@pytest_asyncio.fixture()
async def postgres_async_session(postgres_async_engine: AsyncEngine | None) -> AsyncIterator[AsyncSession]:
    if postgres_async_engine is None:
        pytest.skip("Set E2E_DATABASE_URL to run Postgres-backed async session tests.")

    async_session_factory = async_sessionmaker(postgres_async_engine, expire_on_commit=False)

    async with async_session_factory() as session:
        yield session
