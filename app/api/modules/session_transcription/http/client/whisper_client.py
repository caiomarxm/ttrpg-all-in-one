from __future__ import annotations

import base64
import io
import wave
from dataclasses import dataclass
from pathlib import Path

import httpx
from pydantic import BaseModel

from modules.session_transcription.config import SessionTranscriptionSettings
from modules.session_transcription.http.dto.session_manifest import SpeakingBurst


@dataclass(frozen=True, slots=True)
class WhisperSegment:
    speaker: str
    start: float
    end: float
    text: str


class OpenRouterTranscriptionResponse(BaseModel):
    text: str = ""


def speaker_label_from_wav(path: Path) -> str:
    stem = path.stem
    if "_" in stem:
        return stem.split("_", 1)[1]
    return stem


def extract_burst_wav_bytes(wav_path: Path, offset_bytes: int, pcm_bytes: int) -> bytes:
    with wave.open(str(wav_path), "rb") as source:
        channels = source.getnchannels()
        sample_width = source.getsampwidth()
        frame_rate = source.getframerate()
        frame_size = channels * sample_width
        frame_offset = offset_bytes // frame_size
        frame_count = pcm_bytes // frame_size
        source.setpos(frame_offset)
        pcm = source.readframes(frame_count)

    buffer = io.BytesIO()
    with wave.open(buffer, "wb") as target:
        target.setnchannels(channels)
        target.setsampwidth(sample_width)
        target.setframerate(frame_rate)
        target.writeframes(pcm)
    return buffer.getvalue()


def _wav_duration_seconds(wav_bytes: bytes) -> float:
    with wave.open(io.BytesIO(wav_bytes), "rb") as wav_file:
        return wav_file.getnframes() / float(wav_file.getframerate())


class WhisperClient:
    def __init__(self, config: SessionTranscriptionSettings) -> None:
        self._config = config
        self._base_url = config.OPENROUTER_BASE_URL.rstrip("/")

    def transcribe_wav(
        self,
        wav_path: Path,
        *,
        speaking_bursts: list[SpeakingBurst] | None = None,
        bytes_per_second: float | None = None,
    ) -> list[WhisperSegment]:
        speaker = speaker_label_from_wav(wav_path)
        if speaking_bursts and bytes_per_second:
            return self._transcribe_bursts(wav_path, speaker, speaking_bursts, bytes_per_second)

        wav_bytes = wav_path.read_bytes()
        text = self._transcribe_audio_bytes(wav_bytes)
        if not text:
            return []

        duration = _wav_duration_seconds(wav_bytes)
        return [
            WhisperSegment(
                speaker=speaker,
                start=0.0,
                end=duration,
                text=text,
            )
        ]

    def _transcribe_bursts(
        self,
        wav_path: Path,
        speaker: str,
        speaking_bursts: list[SpeakingBurst],
        bytes_per_second: float,
    ) -> list[WhisperSegment]:
        segments: list[WhisperSegment] = []
        for burst in speaking_bursts:
            burst_wav = extract_burst_wav_bytes(wav_path, burst.wav_offset_bytes, burst.pcm_bytes)
            text = self._transcribe_audio_bytes(burst_wav)
            if not text:
                continue

            file_start = burst.wav_offset_bytes / bytes_per_second
            duration = _wav_duration_seconds(burst_wav)
            segments.append(
                WhisperSegment(
                    speaker=speaker,
                    start=file_start,
                    end=file_start + duration,
                    text=text,
                )
            )
        return segments

    def _transcribe_audio_bytes(self, wav_bytes: bytes) -> str:
        payload: dict[str, object] = {
            "model": self._config.OPENROUTER_MODEL,
            "input_audio": {
                "data": base64.b64encode(wav_bytes).decode("ascii"),
                "format": "wav",
            },
        }
        if self._config.TRANSCRIPTION_LANGUAGE:
            payload["language"] = self._config.TRANSCRIPTION_LANGUAGE
        if self._config.TRANSCRIPTION_PROMPT:
            payload["provider"] = {
                "options": {
                    "openai": {
                        "prompt": self._config.TRANSCRIPTION_PROMPT,
                    }
                }
            }

        with httpx.Client(timeout=600.0) as client:
            response = client.post(
                f"{self._base_url}/audio/transcriptions",
                json=payload,
                headers={
                    "Authorization": f"Bearer {self._config.OPENROUTER_API_KEY}",
                    "Content-Type": "application/json",
                },
            )
            response.raise_for_status()

        result = OpenRouterTranscriptionResponse.model_validate(response.json())
        return result.text.strip()
