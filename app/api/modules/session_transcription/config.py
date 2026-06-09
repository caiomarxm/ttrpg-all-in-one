from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class SessionTranscriptionSettings(BaseSettings):
    model_config = SettingsConfigDict(env_prefix="SESSION_TRANSCRIPTION_")

    DATABASE_URL: str = "postgresql+psycopg://ttrpg:ttrpg@localhost:5432/session_transcription"

    RECORDINGS_DIR: str = "/data/recordings"

    OPENROUTER_BASE_URL: str = "https://openrouter.ai/api/v1"
    OPENROUTER_API_KEY: str = ""
    OPENROUTER_MODEL: str = "openai/gpt-4o-transcribe"
    TRANSCRIPTION_LANGUAGE: str = "pt"
    TRANSCRIPTION_PROMPT: str = "Alô, alô, o que é que você está fazendo?"

    STORAGE_ENABLED: bool = False
    STORAGE_ENDPOINT_URL: str = "http://localhost:9000"
    STORAGE_ACCESS_KEY: str = "minio"
    STORAGE_SECRET_KEY: str = "minio-dev-password"
    STORAGE_BUCKET: str = "ttrpg-recordings"
    STORAGE_REGION: str = "us-east-1"


@lru_cache
def get_session_transcription_settings() -> SessionTranscriptionSettings:
    return SessionTranscriptionSettings()
