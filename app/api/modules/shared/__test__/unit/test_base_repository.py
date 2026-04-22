from __future__ import annotations

import pytest
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession
from sqlmodel import Session

from modules.shared.__test__.unit._models import SharedTestItem, new_shared_test_item
from modules.shared.persistence.repository.base_repository import BaseRepository


def test_base_repository_sqlite_round_trip(sqlite_session: Session) -> None:
    repo = BaseRepository(SharedTestItem, sqlite_session)

    with sqlite_session.begin():
        saved = repo.save(new_shared_test_item(name="Example"))

    loaded = repo.find_one_by_id(saved.id)
    assert loaded is not None
    assert loaded.name == "Example"


@pytest.mark.asyncio
async def test_async_session_fixture_can_query(postgres_async_session: AsyncSession) -> None:
    result = await postgres_async_session.execute(text("select 1"))
    assert result.scalar_one() == 1
