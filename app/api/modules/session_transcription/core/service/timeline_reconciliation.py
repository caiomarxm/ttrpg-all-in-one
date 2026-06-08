from __future__ import annotations

import json
from pathlib import Path

from modules.session_transcription.http.client.whisper_client import WhisperSegment
from modules.session_transcription.http.dto.session_manifest import (
    SessionManifest,
    SpeakingBurst,
)


def load_session_manifest(session_dir: Path) -> SessionManifest:
    manifest_path = session_dir / "session_manifest.json"
    if not manifest_path.is_file():
        raise FileNotFoundError(
            f"Session manifest not found: {manifest_path}. "
            "Timeline reconciliation requires session_manifest.json."
        )

    payload = json.loads(manifest_path.read_text(encoding="utf-8"))
    return SessionManifest.model_validate(payload)


def user_id_from_wav(wav_path: Path) -> str:
    stem = wav_path.stem
    if "_" in stem:
        return stem.split("_", 1)[0]
    return stem


def _find_containing_burst(bursts: list[SpeakingBurst], byte_offset: float) -> SpeakingBurst:
    for burst in bursts:
        burst_end = burst.wav_offset_bytes + burst.pcm_bytes
        if burst.wav_offset_bytes <= byte_offset < burst_end:
            return burst

    for burst in reversed(bursts):
        if byte_offset >= burst.wav_offset_bytes:
            return burst

    return bursts[0]


def _file_seconds_to_session_seconds(
    file_seconds: float,
    bursts: list[SpeakingBurst],
    bytes_per_second: float,
) -> float:
    byte_offset = file_seconds * bytes_per_second
    burst = _find_containing_burst(bursts, byte_offset)
    offset_in_burst_seconds = (byte_offset - burst.wav_offset_bytes) / bytes_per_second
    return burst.session_offset_ms / 1000 + offset_in_burst_seconds


def reconcile_segments(
    segments: list[WhisperSegment],
    manifest: SessionManifest,
    wav_path: Path,
) -> list[WhisperSegment]:
    user_id = user_id_from_wav(wav_path)
    speaker_entry = manifest.speakers.get(user_id)
    if speaker_entry is None:
        raise ValueError(f"No manifest entry for speaker user_id={user_id} in {wav_path.name}")

    bursts = speaker_entry.speaking_bursts
    if not bursts:
        return segments

    bytes_per_second = float(manifest.audio.bytes_per_second)
    reconciled: list[WhisperSegment] = []

    for segment in segments:
        reconciled.append(
            WhisperSegment(
                speaker=segment.speaker,
                start=_file_seconds_to_session_seconds(segment.start, bursts, bytes_per_second),
                end=_file_seconds_to_session_seconds(segment.end, bursts, bytes_per_second),
                text=segment.text,
            )
        )

    return reconciled


def format_session_timestamp(seconds: float) -> str:
    total = int(seconds)
    hours = total // 3600
    minutes = (total % 3600) // 60
    secs = total % 60
    return f"[{hours:02d}:{minutes:02d}:{secs:02d}]"
