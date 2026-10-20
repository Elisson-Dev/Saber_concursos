"""Configurações da aplicação Saber Concursos.
"""
from dataclasses import dataclass
import os
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent.parent.parent

@dataclass(frozen=True)
class Settings:
    host: str = os.getenv("HOST", "0.0.0.0")
    port: int = int(os.getenv("PORT", "8000"))
    mcp_url: str = os.getenv("PCI_MCP_URL", "https://mcp.pciconcursos.com.br/mcp")
    db_path: str = os.getenv("SABER_DB_PATH", str(BASE_DIR / "data" / "saber_concursos.db"))
    cache_ttl_seconds: int = int(os.getenv("CACHE_TTL_SECONDS", "300"))
    timeout_seconds: float = float(os.getenv("MCP_TIMEOUT_SECONDS", "25.0"))
    debug: bool = os.getenv("DEBUG", "false").lower() in ("true", "1", "yes")

settings = Settings()
