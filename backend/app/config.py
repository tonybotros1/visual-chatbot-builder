from functools import lru_cache

from pydantic import field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

# Browsers on private networks (10.x, 192.168.x, 172.16-31.x, *.local) on any port, plus localhost.
DEFAULT_CORS_ORIGIN_REGEX = (
    r"^https?://(localhost|127\.0\.0\.1|10\.\d{1,3}\.\d{1,3}\.\d{1,3}|192\.168\.\d{1,3}\.\d{1,3}"
    r"|172\.(1[6-9]|2\d|3[01])\.\d{1,3}\.\d{1,3}|[a-z0-9-]+\.local)(:\d+)?$"
)


class Settings(BaseSettings):
    app_name: str = "Spaghetti API"
    database_url: str = (
        "postgresql+psycopg://visual_chatbot:visual_chatbot_dev@localhost:5432/visual_chatbot"
    )
    cors_origins: list[str] = ["http://localhost:3000", "http://127.0.0.1:3000"]
    # Also accept the builder when it is opened from another computer on the LAN (private IPv4 ranges,
    # *.local names) on any port. Override with CORS_ORIGIN_REGEX for a public deployment.
    cors_origin_regex: str = DEFAULT_CORS_ORIGIN_REGEX

    @field_validator("cors_origin_regex", mode="before")
    @classmethod
    def default_regex_when_blank(cls, value: object) -> object:
        # Compose passes the variable through even when .env leaves it empty; blank means "use the default".
        return DEFAULT_CORS_ORIGIN_REGEX if value is None or (isinstance(value, str) and not value.strip()) else value
    secret_key: str = "replace-this-development-secret-before-production"
    access_token_expire_minutes: int = 720
    upload_directory: str = "data/uploads"
    max_upload_size_mb: int = 25
    # Azure Blob Storage for uploads. Set either the connection string or the name + key; when
    # present, every upload goes to Azure instead of upload_directory. Container is created on demand.
    azure_storage_connection_string: str = ""
    azure_storage_account_name: str = ""
    azure_storage_account_key: str = ""
    azure_storage_container: str = "spaghetti-uploads"
    azure_storage_endpoint_suffix: str = "core.windows.net"
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
