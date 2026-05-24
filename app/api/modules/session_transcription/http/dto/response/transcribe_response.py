from uuid import UUID

from pydantic import BaseModel

from modules.session_transcription.core.enum.transcription_enum import TranscriptStatus


class TranscribeSessionResponse(BaseModel):
    session_id: str
    transcript_id: UUID
    status: TranscriptStatus
