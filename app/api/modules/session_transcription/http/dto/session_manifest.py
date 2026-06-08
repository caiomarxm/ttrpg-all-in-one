from __future__ import annotations

from pydantic import BaseModel, Field


class SpeakingBurst(BaseModel):
    session_offset_ms: int
    wav_offset_bytes: int
    pcm_bytes: int


class SpeakerManifestEntry(BaseModel):
    user_id: str
    username: str
    wav_file: str
    speaking_bursts: list[SpeakingBurst] = Field(default_factory=list)


class SessionManifestAudio(BaseModel):
    sample_rate: int
    channels: int
    bit_depth: int
    bytes_per_second: int


class SessionManifest(BaseModel):
    version: int
    session_id: str
    session_started_at_ms: int
    audio: SessionManifestAudio
    speakers: dict[str, SpeakerManifestEntry]
