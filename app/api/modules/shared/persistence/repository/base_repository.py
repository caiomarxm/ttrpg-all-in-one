from __future__ import annotations

from collections.abc import Sequence
from typing import Any, TypeVar

from sqlalchemy import ScalarResult
from sqlalchemy.exc import MultipleResultsFound
from sqlmodel import Session, SQLModel, col, delete, select

ModelT = TypeVar("ModelT", bound=SQLModel)


class BaseRepository[ModelT]:
    """Minimal repository wrapper — keeps ORM usage contained to repositories."""

    def __init__(self, model: type[ModelT], session: Session) -> None:
        self._model = model
        self._session = session

    @property
    def session(self) -> Session:
        return self._session

    def save(self, entity: ModelT) -> ModelT:
        self._session.add(entity)
        self._session.flush()
        self._session.refresh(entity)
        return entity

    def find_one_by_id(self, entity_id: Any) -> ModelT | None:
        return self._session.get(self._model, entity_id)

    def find(self, **filters: Any) -> list[ModelT]:
        stmt = select(self._model)
        for key, value in filters.items():
            stmt = stmt.where(col(getattr(self._model, key)) == value)
        result: ScalarResult[ModelT] = self._session.exec(stmt)
        return list(result.all())

    def find_one(self, **filters: Any) -> ModelT | None:
        matches = self.find(**filters)
        if len(matches) > 1:
            raise MultipleResultsFound()
        return matches[0] if matches else None

    def exists(self, **filters: Any) -> bool:
        return bool(self.find(**filters))

    def delete(self, entity: ModelT) -> None:
        self._session.delete(entity)

    def delete_by_ids(self, ids: Sequence[Any]) -> None:
        if not ids:
            return
        stmt = delete(self._model).where(col(self._model.id).in_(tuple(ids)))
        self._session.exec(stmt)
