import wave
from pathlib import Path
from unittest.mock import MagicMock, patch

from modules.session_transcription.config import SessionTranscriptionSettings
from modules.session_transcription.http.client.whisper_client import WhisperClient


def _write_wav(path: Path, *, duration_seconds: float = 1.0, sample_rate: int = 48_000) -> None:
    frame_count = int(duration_seconds * sample_rate)
    with wave.open(str(path), "wb") as wav_file:
        wav_file.setnchannels(1)
        wav_file.setsampwidth(2)
        wav_file.setframerate(sample_rate)
        wav_file.writeframes(b"\x00\x00" * frame_count)


def test_transcribe_wav_calls_openrouter_and_returns_single_segment(tmp_path: Path) -> None:
    wav_path = tmp_path / "user-1_alice.wav"
    _write_wav(wav_path, duration_seconds=2.0)

    mock_response = MagicMock()
    mock_response.json.return_value = {"text": "ola mundo"}
    mock_response.raise_for_status = MagicMock()

    mock_client = MagicMock()
    mock_client.__enter__.return_value = mock_client
    mock_client.post.return_value = mock_response

    config = SessionTranscriptionSettings(
        OPENROUTER_API_KEY="test-key",
        OPENROUTER_BASE_URL="https://openrouter.ai/api/v1",
        OPENROUTER_MODEL="openai/gpt-4o-transcribe",
        TRANSCRIPTION_LANGUAGE="pt",
        TRANSCRIPTION_PROMPT="Alô, alô.",
    )
    client = WhisperClient(config)

    with patch("modules.session_transcription.http.client.whisper_client.httpx.Client", return_value=mock_client):
        segments = client.transcribe_wav(wav_path)

    assert len(segments) == 1
    assert segments[0].speaker == "alice"
    assert segments[0].start == 0.0
    assert segments[0].end == 2.0
    assert segments[0].text == "ola mundo"

    mock_client.post.assert_called_once()
    call_kwargs = mock_client.post.call_args.kwargs
    assert call_kwargs["headers"]["Authorization"] == "Bearer test-key"
    payload = call_kwargs["json"]
    assert payload["model"] == "openai/gpt-4o-transcribe"
    assert payload["language"] == "pt"
    assert payload["provider"]["options"]["openai"]["prompt"] == "Alô, alô."
    assert payload["input_audio"]["format"] == "wav"
    assert payload["input_audio"]["data"]


def test_transcribe_wav_returns_empty_list_for_blank_text(tmp_path: Path) -> None:
    wav_path = tmp_path / "user-1_alice.wav"
    _write_wav(wav_path)

    mock_response = MagicMock()
    mock_response.json.return_value = {"text": "   "}
    mock_response.raise_for_status = MagicMock()

    mock_client = MagicMock()
    mock_client.__enter__.return_value = mock_client
    mock_client.post.return_value = mock_response

    client = WhisperClient(SessionTranscriptionSettings(OPENROUTER_API_KEY="test-key"))

    with patch("modules.session_transcription.http.client.whisper_client.httpx.Client", return_value=mock_client):
        segments = client.transcribe_wav(wav_path)

    assert segments == []
