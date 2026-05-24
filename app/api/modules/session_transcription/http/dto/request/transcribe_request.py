from pydantic import BaseModel, Field


class TranscribeSessionRequest(BaseModel):
    wav_paths: list[str] = Field(default_factory=list)
