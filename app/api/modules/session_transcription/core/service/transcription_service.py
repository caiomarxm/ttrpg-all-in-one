from __future__ import annotations

import logging
from collections import defaultdict
from datetime import UTC, datetime
from pathlib import Path
from uuid import UUID

from sqlmodel import Session

from modules.session_transcription.config import (
    SessionTranscriptionSettings,
    get_session_transcription_settings,
)
from modules.session_transcription.core.enum.transcription_enum import TranscriptStatus
from modules.session_transcription.core.service.timeline_reconciliation import (
    format_session_timestamp,
    load_session_manifest,
    reconcile_segments,
    user_id_from_wav,
)
from modules.session_transcription.http.client.storage_client import StorageClient
from modules.session_transcription.http.client.whisper_client import WhisperClient, WhisperSegment
from modules.session_transcription.persistence.model.transcript import SessionTranscriptionTranscript
from modules.session_transcription.persistence.repository.transcript_repository import TranscriptRepository

logger = logging.getLogger(__name__)


def format_transcript(segments: list[WhisperSegment]) -> str:
    ordered = sorted(segments, key=lambda segment: segment.start)
    lines = [
        f"{format_session_timestamp(segment.start)} {segment.speaker}: {segment.text}"
        for segment in ordered
        if segment.text
    ]
    return "\n".join(lines) + ("\n" if lines else "")


class TranscriptionService:
    def __init__(
        self,
        session: Session,
        config: SessionTranscriptionSettings | None = None,
        whisper_client: WhisperClient | None = None,
        storage_client: StorageClient | None = None,
    ) -> None:
        self._session = session
        self._config = config or get_session_transcription_settings()
        self._repo = TranscriptRepository(session)
        self._whisper = whisper_client or WhisperClient(self._config)
        if storage_client is not None:
            self._storage = storage_client
        elif self._config.STORAGE_ENABLED:
            self._storage = StorageClient(self._config)
        else:
            self._storage = None

    def enqueue_transcription(self, session_id: str, wav_paths: list[str]) -> SessionTranscriptionTranscript:
        existing = self._repo.find_by_session_id(session_id)
        if existing and existing.status == TranscriptStatus.COMPLETED:
            return existing

        transcript = existing or SessionTranscriptionTranscript(session_id=session_id)
        transcript.status = TranscriptStatus.PENDING
        transcript.updated_at = datetime.now(UTC)
        self._repo.save(transcript)
        return transcript

    def run_transcription(self, session_id: str, wav_paths: list[str]) -> SessionTranscriptionTranscript:
        transcript = self._repo.find_by_session_id(session_id)
        if transcript is None:
            transcript = SessionTranscriptionTranscript(session_id=session_id)
            self._repo.save(transcript)

        try:
            segments = self._transcribe_paths(session_id, wav_paths)
            transcript.content = format_transcript(segments)
            transcript.status = TranscriptStatus.COMPLETED
            transcript.error_message = None
            transcript.updated_at = datetime.now(UTC)
            self._repo.save(transcript)
            self._trigger_artifact_generation(session_id, transcript.id)
            return transcript
        except Exception as exc:
            transcript.status = TranscriptStatus.FAILED
            transcript.error_message = str(exc)
            transcript.updated_at = datetime.now(UTC)
            self._repo.save(transcript)
            logger.exception("transcription_failed", extra={"session_id": session_id})
            raise

    def _transcribe_paths(self, session_id: str, wav_paths: list[str]) -> list[WhisperSegment]:
        if not wav_paths:
            session_dir = Path(self._config.RECORDINGS_DIR) / session_id
            wav_paths = [str(path) for path in sorted(session_dir.glob("*.wav"))]

        if not wav_paths:
            raise FileNotFoundError(f"No WAV files found for session {session_id}")

        session_dir = Path(self._config.RECORDINGS_DIR) / session_id
        manifest = load_session_manifest(session_dir)

        storage_prefix = f"recordings/{session_id}"
        all_segments: list[WhisperSegment] = []

        for wav_path_str in wav_paths:
            wav_path = Path(wav_path_str)
            if not wav_path.is_file():
                raise FileNotFoundError(f"WAV file not found: {wav_path}")

            if self._storage is not None:
                object_key = f"{storage_prefix}/{wav_path.name}"
                self._storage.upload_file(wav_path, object_key)
            speaker_entry = manifest.speakers.get(user_id_from_wav(wav_path))
            speaking_bursts = speaker_entry.speaking_bursts if speaker_entry is not None else None
            raw_segments = self._whisper.transcribe_wav(
                wav_path,
                speaking_bursts=speaking_bursts,
                bytes_per_second=float(manifest.audio.bytes_per_second),
            )
            all_segments.extend(reconcile_segments(raw_segments, manifest, wav_path))

        transcript = self._repo.find_by_session_id(session_id)
        if transcript is not None:
            transcript.storage_prefix = storage_prefix
            transcript.updated_at = datetime.now(UTC)
            self._repo.save(transcript)

        by_speaker: dict[str, list[WhisperSegment]] = defaultdict(list)
        for segment in all_segments:
            by_speaker[segment.speaker].append(segment)

        session_dir.mkdir(parents=True, exist_ok=True)
        for speaker, speaker_segments in by_speaker.items():
            per_speaker_path = session_dir / f"transcript_{speaker}.txt"
            per_speaker_path.write_text(format_transcript(speaker_segments), encoding="utf-8")

        combined_path = session_dir / "transcript.txt"
        combined_path.write_text(format_transcript(all_segments), encoding="utf-8")

        return all_segments

    def _trigger_artifact_generation(self, session_id: str, transcript_id: UUID) -> None:
        logger.info(
            "artifact_generation_triggered",
            extra={"session_id": session_id, "transcript_id": str(transcript_id)},
        )
