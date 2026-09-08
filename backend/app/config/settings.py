# Backend configuration settings

from pydantic import BaseSettings


class Settings(BaseSettings):
    database_url: str = "sqlite:///./test.db"
    openai_api_key: str = ""

    class Config:
        env_file = "../../.env"
