import wave
from pathlib import Path

from config import TranscriberConfig
from transcription import transcribe_session


class _FakeWhisperSegment:
    def __init__(self, start: float, end: float, text: str) -> None:
        self.start = start
        self.end = end
        self.text = text


class FakeWhisperModel:
    def transcribe(self, path: str, language: str = "pt", vad_filter: bool = True):
        _ = path, language, vad_filter
        return (
            iter(
                [
                    _FakeWhisperSegment(
                        0.0,
                        1.5,
                        " Olá, esta é uma gravação de teste.",
                    ),
                ]
            ),
            None,
        )


def _write_silent_wav(path: Path) -> None:
    with wave.open(str(path), "wb") as wav_file:
        wav_file.setnchannels(2)
        wav_file.setsampwidth(2)
        wav_file.setframerate(48_000)
        wav_file.writeframes(b"\x00\x00" * 48_000)


def test_transcribe_session_writes_merged_pt_transcript(tmp_path: Path) -> None:
    session_id = "session-integration"
    session_dir = tmp_path / session_id
    session_dir.mkdir()
    _write_silent_wav(session_dir / "111_alice.wav")

    config = TranscriberConfig(
        recordings_dir=str(tmp_path),
        whisper_model="small",
    )

    output = transcribe_session(
        session_id,
        config,
        model=FakeWhisperModel(),  # type: ignore[arg-type]
    )

    content = output.read_text(encoding="utf-8")
    assert "alice" in content
    assert "gravação" in content

    per_speaker = session_dir / "transcript_alice.txt"
    assert per_speaker.exists()
    assert "gravação" in per_speaker.read_text(encoding="utf-8")


