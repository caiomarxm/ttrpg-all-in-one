from pydantic_settings import BaseSettings, SettingsConfigDict


class SharedSettings(BaseSettings):
    """Environment for the shared bounded context (`SHARED_*`)."""

    model_config = SettingsConfigDict(env_prefix="SHARED_")
