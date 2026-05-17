from pathlib import Path

from pydantic import SecretStr
from pydantic_settings import BaseSettings, SettingsConfigDict

_ENV_FILE = Path(__file__).parent / ".env"


class Config(BaseSettings):
    model_config = SettingsConfigDict(env_file=str(_ENV_FILE), strict=True)

    BOT_TOKEN: SecretStr
    SERVER_ID: int
    RECORDINGS_DIR: Path = Path("/data/recordings")
