import logging
from typing import Annotated

from fastapi import APIRouter, BackgroundTasks, Depends, status
from sqlmodel import Session

from modules.session_transcription.config import get_session_transcription_settings
from modules.session_transcription.core.service.transcription_service import TranscriptionService
from modules.session_transcription.http.dto.request.transcribe_request import TranscribeSessionRequest
from modules.session_transcription.http.dto.response.transcribe_response import TranscribeSessionResponse
from modules.session_transcription.persistence.database import (
    get_session_transcription_engine,
    get_session_transcription_session,
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/sessions", tags=["session-transcription"])


def get_transcription_service(
    session: Annotated[Session, Depends(get_session_transcription_session)],
) -> TranscriptionService:
    return TranscriptionService(session)


def _run_transcription_job(session_id: str, wav_paths: list[str]) -> None:
    settings = get_session_transcription_settings()
    logger.info("background_transcription_started", extra={"session_id": session_id})
    with Session(get_session_transcription_engine()) as session:
        service = TranscriptionService(session, config=settings)
        try:
            service.run_transcription(session_id, wav_paths)
            session.commit()
            logger.info("background_transcription_completed", extra={"session_id": session_id})
        except Exception:
            session.rollback()
            logger.exception("background_transcription_failed", extra={"session_id": session_id})


@router.post(
    "/{session_id}/transcribe",
    response_model=TranscribeSessionResponse,
    status_code=status.HTTP_202_ACCEPTED,
)
async def transcribe_session(
    session_id: str,
    body: TranscribeSessionRequest,
    background_tasks: BackgroundTasks,
    service: Annotated[TranscriptionService, Depends(get_transcription_service)],
    session: Annotated[Session, Depends(get_session_transcription_session)],
) -> TranscribeSessionResponse:
    transcript = service.enqueue_transcription(session_id, body.wav_paths)
    session.commit()
    background_tasks.add_task(_run_transcription_job, session_id, body.wav_paths)
    return TranscribeSessionResponse(
        session_id=session_id,
        transcript_id=transcript.id,
        status=transcript.status,
    )
