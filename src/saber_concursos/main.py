"""Ponto de entrada principal do servidor Saber Concursos.
Inicializa o FastAPI, configura arquivos estáticos e gerencia o ciclo de vida.
"""
from contextlib import asynccontextmanager
import logging
from pathlib import Path
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
import uvicorn
from saber_concursos.api.routes import router
from saber_concursos.config import settings
from saber_concursos.db.database import init_db
from saber_concursos.db.repository import Repository

logging.basicConfig(
    level=logging.INFO if not settings.debug else logging.DEBUG,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)
logger = logging.getLogger("saber_concursos")

STATIC_DIR = Path(__file__).resolve().parent / "static"


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Gerenciamento de inicialização e encerramento da aplicação."""
    logger.info("Iniciando Saber Concursos...")
    init_db()
    cleaned = Repository.cleanup_expired_cache()
    if cleaned > 0:
        logger.info("Limpeza de cache: %d entradas expiradas removidas.", cleaned)
    yield
    logger.info("Finalizando Saber Concursos.")


app = FastAPI(
    title="Saber Concursos - MCP Hub & Dashboard",
    description="Interface moderna para consulta de concursos públicos e apostilas via PCI Concursos MCP.",
    version="0.1.0",
    lifespan=lifespan,
)

# Configuração de CORS para segurança e flexibilidade
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Registro das rotas da API
app.include_router(router)

# Monta os arquivos estáticos se o diretório existir
if STATIC_DIR.exists():
    app.mount("/static", StaticFiles(directory=str(STATIC_DIR)), name="static")


@app.get("/", include_in_schema=False)
async def serve_index():
    """Entrega a Single Page Application (SPA) para o navegador."""
    index_file = STATIC_DIR / "index.html"
    if index_file.exists():
        return FileResponse(str(index_file))
    return {"message": "Saber Concursos API em execução. Frontend em carregamento."}


def main():
    """Função executável via linha de comando ou uv run."""
    logger.info("Executando servidor em http://%s:%s", settings.host, settings.port)
    uvicorn.run(
        "saber_concursos.main:app",
        host=settings.host,
        port=settings.port,
        reload=settings.debug,
    )


if __name__ == "__main__":
    main()
