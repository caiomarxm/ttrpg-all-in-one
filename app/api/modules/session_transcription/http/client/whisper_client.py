from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path

import httpx
from pydantic import BaseModel, Field

from modules.session_transcription.config import SessionTranscriptionSettings


@dataclass(frozen=True, slots=True)
class WhisperSegment:
    speaker: str
    start: float
    end: float
    text: str


class WhisperVerboseSegment(BaseModel):
    start: float
    end: float
    text: str


class WhisperVerboseResponse(BaseModel):
    text: str = ""
    segments: list[WhisperVerboseSegment] = Field(default_factory=list)


def speaker_label_from_wav(path: Path) -> str:
    stem = path.stem
    if "_" in stem:
        return stem.split("_", 1)[1]
    return stem


class WhisperClient:
    def __init__(self, config: SessionTranscriptionSettings) -> None:
        self._config = config
        self._base_url = config.WHISPER_BASE_URL.rstrip("/")

    def transcribe_wav(self, wav_path: Path) -> list[WhisperSegment]:
        speaker = speaker_label_from_wav(wav_path)
        with wav_path.open("rb") as audio_file:
            files = {"file": (wav_path.name, audio_file, "audio/wav")}
            data = {
                "model": self._config.WHISPER_MODEL,
                "language": self._config.WHISPER_LANGUAGE,
                "response_format": "verbose_json",
            }
            with httpx.Client(timeout=600.0) as client:
                response = client.post(
                    f"{self._base_url}/audio/transcriptions",
                    files=files,
                    data=data,
                    headers={"Authorization": f"Bearer {self._config.WHISPER_API_KEY}"},
                )
                response.raise_for_status()

        payload = WhisperVerboseResponse.model_validate(response.json())
        segments: list[WhisperSegment] = []
        for segment in payload.segments:
            text = segment.text.strip()
            if not text:
                continue
            segments.append(
                WhisperSegment(
                    speaker=speaker,
                    start=segment.start,
                    end=segment.end,
                    text=text,
                )
            )

        if not segments and payload.text.strip():
            segments.append(
                WhisperSegment(
                    speaker=speaker,
                    start=0.0,
                    end=0.0,
                    text=payload.text.strip(),
                )
            )

        return segments
