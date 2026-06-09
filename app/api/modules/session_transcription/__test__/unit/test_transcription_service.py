import json
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

BYTES_PER_SECOND = 192_000


def _write_manifest(session_dir: Path, session_id: str = "session-1") -> None:
    manifest = {
        "version": 1,
        "session_id": session_id,
        "session_started_at_ms": 1_000_000,
        "audio": {
            "sample_rate": 48_000,
            "channels": 2,
            "bit_depth": 16,
            "bytes_per_second": BYTES_PER_SECOND,
        },
        "speakers": {
            "user-1": {
                "user_id": "user-1",
                "username": "alice",
                "wav_file": "user-1_alice.wav",
                "speaking_bursts": [
                    {
                        "session_offset_ms": 0,
                        "wav_offset_bytes": 0,
                        "pcm_bytes": BYTES_PER_SECOND,
                    }
                ],
            }
        },
    }
    (session_dir / "session_manifest.json").write_text(
        json.dumps(manifest),
        encoding="utf-8",
    )


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
    _write_manifest(session_dir, session_id)

    whisper = MagicMock()
    whisper.transcribe_wav.return_value = [
        WhisperSegment(speaker="alice", start=0.0, end=1.0, text="ola"),
    ]
    storage = MagicMock()

    config = SessionTranscriptionSettings(
        RECORDINGS_DIR=str(tmp_path),
        STORAGE_ENABLED=True,
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
    assert "[00:00:00] alice: ola" in transcript.content
    assert transcript.storage_prefix == f"recordings/{session_id}"
    storage.upload_file.assert_called_once()
    whisper.transcribe_wav.assert_called_once_with(wav_path)
    assert (session_dir / "transcript.txt").exists()


def test_run_transcription_fails_without_manifest(
    sqlite_session: Session,
    tmp_path: Path,
) -> None:
    session_id = "session-no-manifest"
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
        STORAGE_ENABLED=True,
        STORAGE_ENDPOINT_URL="http://localhost:9000",
    )
    service = TranscriptionService(
        sqlite_session,
        config=config,
        whisper_client=whisper,
        storage_client=storage,
    )

    with pytest.raises(FileNotFoundError, match="session_manifest.json"):
        service.run_transcription(session_id, [str(wav_path)])

    transcript = service._repo.find_by_session_id(session_id)
    assert transcript is not None
    assert transcript.status == TranscriptStatus.FAILED


def test_enqueue_transcription_creates_pending_record(sqlite_session: Session) -> None:
    service = TranscriptionService(
        sqlite_session,
        storage_client=MagicMock(),
        whisper_client=MagicMock(),
    )
    transcript = service.enqueue_transcription("session-2", [])

    assert transcript.session_id == "session-2"
    assert transcript.status == TranscriptStatus.PENDING
