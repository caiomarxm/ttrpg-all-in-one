from pydantic_settings import BaseSettings, SettingsConfigDict


class TranscriberConfig(BaseSettings):
    model_config = SettingsConfigDict(env_prefix="TRANSCRIBER_")

    rabbitmq_url: str = "amqp://guest:guest@rabbitmq:5672"
    recordings_dir: str = "/data/recordings"
    whisper_model: str = "small"
