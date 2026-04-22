from __future__ import annotations

import uuid

from sqlmodel import Field, SQLModel


class SharedTestItem(SQLModel, table=True):
    __tablename__ = "shared_test_item"

    id: str | None = Field(default=None, primary_key=True)
    name: str


def new_shared_test_item(*, name: str) -> SharedTestItem:
    return SharedTestItem(id=str(uuid.uuid4()), name=name)
