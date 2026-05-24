from unittest.mock import MagicMock
from uuid import uuid4

from fastapi.testclient import TestClient

from main import app
from modules.session_transcription.core.enum.transcription_enum import TranscriptStatus
from modules.session_transcription.http.router import transcribe_router as transcribe_router_module
from modules.session_transcription.http.router.transcribe_router import get_transcription_service


def test_transcribe_session_returns_202(monkeypatch) -> None:
    transcript = MagicMock()
    transcript.id = uuid4()
    transcript.status = TranscriptStatus.PENDING

    service = MagicMock()
    service.enqueue_transcription.return_value = transcript

    app.dependency_overrides[get_transcription_service] = lambda: service
    monkeypatch.setattr(transcribe_router_module, "_run_transcription_job", lambda *_args: None)

    try:
        client = TestClient(app)
        response = client.post(
            "/session-transcription/sessions/session-abc/transcribe",
            json={"wav_paths": ["/data/recordings/session-abc/user-1_alice.wav"]},
        )
    finally:
        app.dependency_overrides.clear()

    assert response.status_code == 202
    payload = response.json()
    assert payload["session_id"] == "session-abc"
    assert payload["status"] == "pending"
    service.enqueue_transcription.assert_called_once_with(
        "session-abc",
        ["/data/recordings/session-abc/user-1_alice.wav"],
    )
