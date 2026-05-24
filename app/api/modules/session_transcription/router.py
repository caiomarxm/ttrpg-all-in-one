from fastapi import APIRouter

from modules.session_transcription.http.router.transcribe_router import router as transcribe_router

router = APIRouter(prefix="/session-transcription", tags=["session-transcription"])
router.include_router(transcribe_router)
