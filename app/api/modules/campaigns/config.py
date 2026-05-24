from pydantic_settings import BaseSettings, SettingsConfigDict


class CampaignsSettings(BaseSettings):
    model_config = SettingsConfigDict(env_prefix="CAMPAIGNS_")

    database_url: str = "postgresql+psycopg://ttrpg:ttrpg@localhost:5432/campaigns"
