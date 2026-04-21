from pydantic_settings import BaseSettings, SettingsConfigDict


class IamSettings(BaseSettings):
    model_config = SettingsConfigDict(env_prefix="IAM_")

    firebase_project_id: str = ""
