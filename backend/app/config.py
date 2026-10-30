from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    app_name: str = "Spaghetti API"
    database_url: str = (
        "postgresql+psycopg://visual_chatbot:visual_chatbot_dev@localhost:5432/visual_chatbot"
    )
    cors_origins: list[str] = ["http://localhost:3000", "http://localhost:3100"]
    secret_key: str = "replace-this-development-secret-before-production"
    access_token_expire_minutes: int = 720
    upload_directory: str = "data/uploads"
    max_upload_size_mb: int = 25
    public_rate_limit_per_minute: int = 120
    # The platform super admin is created/updated from these at startup; never hard-code credentials in source.
    super_admin_email: str = ""
    super_admin_password: str = ""
    super_admin_name: str = "Platform admin"
    # Seeds the sample "Eligibility demo" bot and "Consent decision" subflow under the super admin.
    seed_demo_data: bool = True

    model_config = SettingsConfigDict(env_file=".env", extra="ignore")


@lru_cache
def get_settings() -> Settings:
    return Settings()
