# Multi-stage optimized Dockerfile para Saber Concursos
FROM python:3.12-slim

# Copia o binário oficial do UV
COPY --from=ghcr.io/astral-sh/uv:0.12.5 /uv /uvx /bin/

# Variáveis de ambiente de produção
ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    UV_COMPILE_BYTECODE=1 \
    HOST=0.0.0.0 \
    PORT=8000 \
    SABER_DB_PATH=/app/data/saber_concursos.db \
    PATH="/app/.venv/bin:$PATH"

WORKDIR /app

# Utilitários de sistema essenciais e criação de usuário não-root
RUN apt-get update && apt-get install -y --no-install-recommends \
    curl \
    sqlite3 \
    && rm -rf /var/lib/apt/lists/* \
    && groupadd -r appgroup && useradd -r -g appgroup -d /app appuser

# Cria diretório de persistência para o SQLite com permissão adequada
RUN mkdir -p /app/data && chown -R appuser:appgroup /app/data

# Copia os manifestos de dependência do UV para aproveitar o cache
COPY pyproject.toml uv.lock ./

# Instala dependências de terceiros com cache de build local
RUN --mount=type=cache,target=/root/.cache/uv \
    uv sync --frozen --no-install-project

# Copia o código-fonte da aplicação (LICENSE* evita quebra caso o arquivo não exista)
COPY src ./src
COPY README.md LICENSE* ./

# Instala o próprio projeto no ambiente virtual
RUN --mount=type=cache,target=/root/.cache/uv \
    uv sync --frozen

# Garante a posse de /app para o usuário da aplicação
RUN chown -R appuser:appgroup /app

USER appuser

VOLUME ["/app/data"]

EXPOSE 8000

# Verificação de integridade do container
HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
    CMD curl -f http://localhost:8000/api/mcp/health || exit 1

# Comando de inicialização
CMD ["saber-concursos"]