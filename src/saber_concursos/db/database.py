"""Gerenciador de conexão e esquema do banco de dados SQLite3.
"""
from contextlib import contextmanager
import logging
from pathlib import Path
import sqlite3
from typing import Generator
from saber_concursos.config import settings

logger = logging.getLogger(__name__)

SCHEMA_SQL = """
-- Tabela de Favoritos / Acompanhamento de Concursos
CREATE TABLE IF NOT EXISTS favoritos_concursos (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    noticia_id INTEGER UNIQUE NOT NULL,
    titulo TEXT NOT NULL,
    orgao TEXT,
    cargos TEXT, -- JSON array
    vagas_salario TEXT,
    formacao TEXT,
    regiao TEXT,
    uf TEXT,
    data_inicio TEXT,
    data_fim TEXT,
    dias_restantes INTEGER,
    link_noticia TEXT,
    imagem_noticia TEXT,
    link_apostila TEXT,
    status TEXT DEFAULT 'Interessado', -- Interessado, Inscrito, Estudando, Prova Feita, Descartado
    notas TEXT,
    criado_em TEXT DEFAULT CURRENT_TIMESTAMP,
    atualizado_em TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_fav_concursos_uf ON favoritos_concursos(uf);
CREATE INDEX IF NOT EXISTS idx_fav_concursos_status ON favoritos_concursos(status);

-- Tabela de Favoritos de Apostilas e Materiais
CREATE TABLE IF NOT EXISTS favoritos_apostilas (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    apostila_id INTEGER UNIQUE NOT NULL,
    colecao_id INTEGER,
    colecao_titulo TEXT,
    descricao TEXT NOT NULL,
    paginas INTEGER,
    preco REAL,
    preco_formatado TEXT,
    parcelado_6x TEXT,
    imagem TEXT,
    link_compra TEXT,
    notas TEXT,
    criado_em TEXT DEFAULT CURRENT_TIMESTAMP
);

-- Tabela de Histórico de Consultas
CREATE TABLE IF NOT EXISTS historico_buscas (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    tipo_busca TEXT NOT NULL, -- listar, pesquisar, cargo, cidade, apostilas
    termo TEXT,
    filtros TEXT, -- JSON com os parâmetros
    total_resultados INTEGER DEFAULT 0,
    criado_em TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_historico_data ON historico_buscas(criado_em DESC);

-- Tabela de Filtros Salvos / Radares do Usuário
CREATE TABLE IF NOT EXISTS filtros_salvos (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    nome TEXT NOT NULL,
    tipo_busca TEXT NOT NULL,
    parametros TEXT NOT NULL, -- JSON com os argumentos da busca
    ativo INTEGER DEFAULT 1,
    criado_em TEXT DEFAULT CURRENT_TIMESTAMP
);

-- Tabela de Cache Local de Respostas MCP
CREATE TABLE IF NOT EXISTS cache_mcp (
    cache_key TEXT PRIMARY KEY,
    response_json TEXT NOT NULL,
    expires_at INTEGER NOT NULL,
    criado_em INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_cache_expires ON cache_mcp(expires_at);
"""


def init_db(db_path: str | None = None) -> None:
    """Inicializa as tabelas do banco SQLite3 e aplica configurações de alta performance."""
    target_path = Path(db_path or settings.db_path)
    target_path.parent.mkdir(parents=True, exist_ok=True)

    with get_connection(target_path) as conn:
        conn.executescript(SCHEMA_SQL)
        conn.commit()
    logger.info("Banco SQLite inicializado com sucesso em %s", target_path)


@contextmanager
def get_connection(db_path: Path | str | None = None) -> Generator[sqlite3.Connection, None, None]:
    """Obtém uma conexão de banco de dados SQLite com WAL ativado e row_factory configurado."""
    target_path = Path(db_path or settings.db_path)
    target_path.parent.mkdir(parents=True, exist_ok=True)

    conn = sqlite3.connect(
        str(target_path),
        check_same_thread=False,
        timeout=10.0,
    )
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL;")
    conn.execute("PRAGMA synchronous=NORMAL;")
    conn.execute("PRAGMA foreign_keys=ON;")
    conn.execute("PRAGMA busy_timeout=5000;")
    try:
        yield conn
    finally:
        conn.close()
