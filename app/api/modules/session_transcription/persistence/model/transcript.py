from datetime import UTC, datetime
from uuid import UUID, uuid4

from sqlmodel import Field, SQLModel

from modules.session_transcription.core.enum.transcription_enum import TranscriptStatus


class SessionTranscriptionTranscript(SQLModel, table=True):
    __tablename__ = "session_transcription_transcript"

    id: UUID = Field(default_factory=uuid4, primary_key=True)
    session_id: str = Field(index=True, unique=True)
    content: str = Field(default="")
    status: TranscriptStatus = Field(default=TranscriptStatus.PENDING)
    storage_prefix: str = Field(default="")
    error_message: str | None = Field(default=None)
    created_at: datetime = Field(default_factory=lambda: datetime.now(UTC))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(UTC))
