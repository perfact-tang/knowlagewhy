from pathlib import Path

from pydantic import SecretStr
from pydantic_settings import BaseSettings, SettingsConfigDict

ROOT = Path(__file__).resolve().parent.parent


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=ROOT / ".env", extra="ignore")
    aiand_api_key: SecretStr = SecretStr("")
    aiand_chat_model: str = "deepseek-ai/deepseek-v4.1-flash-1017"
    aiand_video_model: str = "minimaxai/minimax-h3-fast"
    neo4j_uri: str = "neo4j://127.0.0.1:7687"
    neo4j_user: str = "neo4j"
    neo4j_password: SecretStr = SecretStr("")
    neo4j_database: str = "neo4j"
    brave_search_api_key: SecretStr = SecretStr("")
    japanese_voice: str = ""
    media_dir: Path = ROOT / "var" / "media"
