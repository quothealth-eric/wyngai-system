"""Configuration management for WyngAI."""

import os
from pathlib import Path
from typing import Optional
from pydantic_settings import BaseSettings


class Config(BaseSettings):
    """Application configuration."""

    # Paths
    data_dir: Path = Path("data")
    warehouse_dir: Path = Path("warehouse")
    rag_dir: Path = Path("rag")
    train_dir: Path = Path("train")
    tests_dir: Path = Path("tests")
    governance_dir: Path = Path("governance")

    # API Keys and URLs
    ecfr_api_base: str = "https://www.ecfr.gov/api/v1"
    federal_register_api_base: str = "https://www.federalregister.gov/api/v1"
    regulations_api_base: str = "https://api.regulations.gov/v4"

    # Database
    database_url: Optional[str] = None
    postgres_host: str = "localhost"
    postgres_port: int = 5432
    postgres_db: str = "wyngai"
    postgres_user: str = "postgres"
    postgres_password: str = "password"

    # Vector DB
    vector_dim: int = 768  # BGE base model dimension
    max_chunk_tokens: int = 2000
    min_chunk_tokens: int = 800

    # Rate limiting
    requests_per_minute: int = 60
    concurrent_requests: int = 10

    # Model settings
    embedding_model: str = "BAAI/bge-base-en-v1.5"
    reranking_model: str = "BAAI/bge-reranker-large"

    class Config:
        env_file = ".env"
        env_prefix = "WYNGAI_"

    @property
    def postgres_url(self) -> str:
        """Get PostgreSQL connection URL."""
        if self.database_url:
            return self.database_url
        return f"postgresql://{self.postgres_user}:{self.postgres_password}@{self.postgres_host}:{self.postgres_port}/{self.postgres_db}"


# Global config instance
config = Config()