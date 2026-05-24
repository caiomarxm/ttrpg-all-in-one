from pathlib import Path
from unittest.mock import MagicMock

import pytest
from sqlmodel import Session, SQLModel, create_engine
from sqlmodel.pool import StaticPool

from modules.session_transcription.config import SessionTranscriptionSettings
from modules.session_transcription.core.enum.transcription_enum import TranscriptStatus
from modules.session_transcription.core.service.transcription_service import TranscriptionService
from modules.session_transcription.http.client.whisper_client import WhisperSegment
from modules.session_transcription.persistence.model.transcript import SessionTranscriptionTranscript  # noqa: F401


@pytest.fixture()
def sqlite_session():
    engine = create_engine(
        "sqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    SQLModel.metadata.create_all(engine)
    with Session(engine) as session:
        yield session


def test_run_transcription_stores_completed_transcript(
    sqlite_session: Session,
    tmp_path: Path,
) -> None:
    session_id = "session-1"
    session_dir = tmp_path / session_id
    session_dir.mkdir()
    wav_path = session_dir / "user-1_alice.wav"
    wav_path.write_bytes(b"RIFF")

    whisper = MagicMock()
    whisper.transcribe_wav.return_value = [
        WhisperSegment(speaker="alice", start=0.0, end=1.0, text="ola"),
    ]
    storage = MagicMock()

    config = SessionTranscriptionSettings(
        RECORDINGS_DIR=str(tmp_path),
        STORAGE_ENDPOINT_URL="http://localhost:9000",
    )
    service = TranscriptionService(
        sqlite_session,
        config=config,
        whisper_client=whisper,
        storage_client=storage,
    )

    transcript = service.run_transcription(session_id, [str(wav_path)])

    assert transcript.status == TranscriptStatus.COMPLETED
    assert "alice" in transcript.content
    assert transcript.storage_prefix == f"recordings/{session_id}"
    storage.upload_file.assert_called_once()
    whisper.transcribe_wav.assert_called_once_with(wav_path)
    assert (session_dir / "transcript.txt").exists()


def test_enqueue_transcription_creates_pending_record(sqlite_session: Session) -> None:
    service = TranscriptionService(sqlite_session)
    transcript = service.enqueue_transcription("session-2", [])

    assert transcript.session_id == "session-2"
    assert transcript.status == TranscriptStatus.PENDING
