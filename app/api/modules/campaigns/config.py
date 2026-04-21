from pydantic_settings import BaseSettings, SettingsConfigDict


class CampaignsSettings(BaseSettings):
    model_config = SettingsConfigDict(env_prefix="CAMPAIGNS_")

    # Provisional default until Docker Compose supplies Postgres + CAMPAIGNS_DATABASE_URL.
    database_url: str = "sqlite:///../../persistence/var/campaigns.db"
