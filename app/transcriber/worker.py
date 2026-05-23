from celery import Celery

from config import TranscriberConfig
from transcription import transcribe_session as run_transcription

config = TranscriberConfig()

celery_app = Celery("transcriber", broker=config.rabbitmq_url)
celery_app.conf.update(
    task_default_queue="celery",
    task_serializer="json",
    accept_content=["json"],
    result_serializer="json",
    timezone="UTC",
    enable_utc=True,
)


@celery_app.task(name="transcribe_session")
def transcribe_session_task(payload: dict[str, str]) -> str:
    session_id = payload["sessionId"]
    output = run_transcription(session_id, config)
    return str(output)
