# Multi-stage optimized Dockerfile para Saber Concursos
FROM python:3.12-slim

# Copia o binário oficial do UV para instalação ultra-rápida
COPY --from=ghcr.io/astral-sh/uv:0.12.5 /uv /uvx /bin/

# Variáveis de ambiente de produção
ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    HOST=0.0.0.0 \
    PORT=8000 \
    SABER_DB_PATH=/app/data/saber_concursos.db \
    UV_SYSTEM_PYTHON=1

WORKDIR /app

# Utilitários de sistema essenciais
RUN apt-get update && apt-get install -y --no-install-recommends \
    curl \
    sqlite3 \
    && rm -rf /var/lib/apt/lists/*

# Copia os manifestos de dependência do UV para aproveitar o cache de camadas do Docker
COPY pyproject.toml uv.lock ./

# Instalação das dependências com UV no Python do sistema
RUN uv sync --frozen --no-cache

# Copia o código-fonte da aplicação
COPY src ./src
COPY README.md LICENSE ./

# Instala o próprio projeto no ambiente
RUN uv pip install --no-cache -e .

# Cria diretório de persistência para o SQLite
RUN mkdir -p /app/data

EXPOSE 8000

# Verificação de integridade do container
HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
    CMD curl -f http://localhost:8000/api/mcp/health || exit 1

# Comando de inicialização
CMD ["uv", "run", "saber-concursos"]
