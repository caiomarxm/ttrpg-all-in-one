from datetime import datetime
from pathlib import Path

from pydantic import BaseModel, ConfigDict


class VoiceSession(BaseModel):
    model_config = ConfigDict(strict=True)

    guild_id: int
    channel_id: int
    started_at: datetime


class SpeakerTrack(BaseModel):
    model_config = ConfigDict(strict=True)

    user_id: int
    username: str
    wav_path: Path
    started_at: datetime
