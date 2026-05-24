from sqlmodel import Session

from modules.session_transcription.persistence.model.transcript import SessionTranscriptionTranscript
from modules.shared.persistence.repository.base_repository import BaseRepository


class TranscriptRepository(BaseRepository[SessionTranscriptionTranscript]):
    def __init__(self, session: Session) -> None:
        super().__init__(SessionTranscriptionTranscript, session)

    def find_by_session_id(self, session_id: str) -> SessionTranscriptionTranscript | None:
        return self.find_one(session_id=session_id)
