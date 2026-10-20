"""Camada de repositório SQLite3 para persistência de dados.
"""
import json
import logging
import time
from typing import Any
from saber_concursos.db.database import get_connection

logger = logging.getLogger(__name__)


class Repository:
    """Repositório central de dados em SQLite3."""

    # -----------------------------
    # CONCURSOS FAVORITOS
    # -----------------------------
    @staticmethod
    def add_favorito_concurso(concurso: dict[str, Any]) -> int:
        noticia = concurso.get("noticia") or {}
        datas = concurso.get("datas") or {}
        cargos = concurso.get("cargos") or []
        noticia_id = noticia.get("id") or concurso.get("id")

        with get_connection() as conn:
            cur = conn.execute(
                """
                INSERT INTO favoritos_concursos (
                    noticia_id, titulo, orgao, cargos, vagas_salario, formacao,
                    regiao, uf, data_inicio, data_fim, dias_restantes,
                    link_noticia, imagem_noticia, link_apostila, status, notas
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT(noticia_id) DO UPDATE SET
                    titulo=excluded.titulo,
                    vagas_salario=excluded.vagas_salario,
                    dias_restantes=excluded.dias_restantes,
                    atualizado_em=CURRENT_TIMESTAMP
                """,
                (
                    noticia_id,
                    noticia.get("titulo") or concurso.get("titulo", "Concurso"),
                    concurso.get("orgao", ""),
                    json.dumps(cargos, ensure_ascii=False),
                    concurso.get("vagas_salario", ""),
                    concurso.get("formacao", ""),
                    concurso.get("regiao", ""),
                    concurso.get("uf", ""),
                    datas.get("inicio", ""),
                    datas.get("fim", ""),
                    datas.get("dias_restantes", 0),
                    noticia.get("link", ""),
                    noticia.get("imagem", ""),
                    (concurso.get("apostila") or {}).get("link", "") if isinstance(concurso.get("apostila"), dict) else "",
                    concurso.get("status", "Interessado"),
                    concurso.get("notas", ""),
                ),
            )
            conn.commit()
            return cur.lastrowid or 0

    @staticmethod
    def remove_favorito_concurso(noticia_id: int) -> bool:
        with get_connection() as conn:
            cur = conn.execute("DELETE FROM favoritos_concursos WHERE noticia_id = ?", (noticia_id,))
            conn.commit()
            return cur.rowcount > 0

    @staticmethod
    def list_favoritos_concursos(status: str | None = None) -> list[dict[str, Any]]:
        with get_connection() as conn:
            if status and status != "todos":
                cur = conn.execute(
                    "SELECT * FROM favoritos_concursos WHERE status = ? ORDER BY criado_em DESC",
                    (status,),
                )
            else:
                cur = conn.execute("SELECT * FROM favoritos_concursos ORDER BY criado_em DESC")
            rows = cur.fetchall()

        result = []
        for row in rows:
            d = dict(row)
            try:
                d["cargos"] = json.loads(d.get("cargos") or "[]")
            except Exception:
                d["cargos"] = []
            result.append(d)
        return result

    @staticmethod
    def update_favorito_concurso(noticia_id: int, status: str | None = None, notas: str | None = None) -> bool:
        updates = []
        params = []
        if status is not None:
            updates.append("status = ?")
            params.append(status)
        if notas is not None:
            updates.append("notas = ?")
            params.append(notas)

        if not updates:
            return False

        updates.append("atualizado_em = CURRENT_TIMESTAMP")
        params.append(noticia_id)

        sql = f"UPDATE favoritos_concursos SET {', '.join(updates)} WHERE noticia_id = ?"
        with get_connection() as conn:
            cur = conn.execute(sql, tuple(params))
            conn.commit()
            return cur.rowcount > 0

    @staticmethod
    def get_favoritos_concursos_ids() -> set[int]:
        with get_connection() as conn:
            cur = conn.execute("SELECT noticia_id FROM favoritos_concursos")
            return {row["noticia_id"] for row in cur.fetchall()}

    # -----------------------------
    # APOSTILAS FAVORITAS
    # -----------------------------
    @staticmethod
    def add_favorito_apostila(item: dict[str, Any]) -> int:
        with get_connection() as conn:
            cur = conn.execute(
                """
                INSERT INTO favoritos_apostilas (
                    apostila_id, colecao_id, colecao_titulo, descricao, paginas,
                    preco, preco_formatado, parcelado_6x, imagem, link_compra, notas
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT(apostila_id) DO UPDATE SET
                    preco=excluded.preco,
                    preco_formatado=excluded.preco_formatado,
                    notas=COALESCE(excluded.notas, favoritos_apostilas.notas)
                """,
                (
                    item.get("id"),
                    item.get("colecao_id"),
                    item.get("colecao_titulo", ""),
                    item.get("descricao", "Apostila"),
                    item.get("paginas", 0),
                    item.get("preco", 0.0),
                    item.get("preco_formatado", ""),
                    item.get("parcelado_6x", ""),
                    item.get("imagem", ""),
                    item.get("link_compra", ""),
                    item.get("notas", ""),
                ),
            )
            conn.commit()
            return cur.lastrowid or 0

    @staticmethod
    def remove_favorito_apostila(apostila_id: int) -> bool:
        with get_connection() as conn:
            cur = conn.execute("DELETE FROM favoritos_apostilas WHERE apostila_id = ?", (apostila_id,))
            conn.commit()
            return cur.rowcount > 0

    @staticmethod
    def list_favoritos_apostilas() -> list[dict[str, Any]]:
        with get_connection() as conn:
            cur = conn.execute("SELECT * FROM favoritos_apostilas ORDER BY criado_em DESC")
            return [dict(row) for row in cur.fetchall()]

    @staticmethod
    def get_favoritos_apostilas_ids() -> set[int]:
        with get_connection() as conn:
            cur = conn.execute("SELECT apostila_id FROM favoritos_apostilas")
            return {row["apostila_id"] for row in cur.fetchall()}

    # -----------------------------
    # HISTÓRICO DE BUSCAS
    # -----------------------------
    @staticmethod
    def add_historico(tipo_busca: str, termo: str | None, filtros: dict[str, Any], total_resultados: int) -> int:
        with get_connection() as conn:
            cur = conn.execute(
                """
                INSERT INTO historico_buscas (tipo_busca, termo, filtros, total_resultados)
                VALUES (?, ?, ?, ?)
                """,
                (tipo_busca, termo or "", json.dumps(filtros, ensure_ascii=False), total_resultados),
            )
            conn.commit()
            return cur.lastrowid or 0

    @staticmethod
    def list_historico(limit: int = 50) -> list[dict[str, Any]]:
        with get_connection() as conn:
            cur = conn.execute(
                "SELECT * FROM historico_buscas ORDER BY criado_em DESC LIMIT ?",
                (limit,),
            )
            rows = cur.fetchall()

        result = []
        for row in rows:
            d = dict(row)
            try:
                d["filtros"] = json.loads(d.get("filtros") or "{}")
            except Exception:
                d["filtros"] = {}
            result.append(d)
        return result

    @staticmethod
    def clear_historico() -> bool:
        with get_connection() as conn:
            conn.execute("DELETE FROM historico_buscas")
            conn.commit()
            return True

    # -----------------------------
    # FILTROS SALVOS / RADARES
    # -----------------------------
    @staticmethod
    def add_filtro_salvo(nome: str, tipo_busca: str, parametros: dict[str, Any]) -> int:
        with get_connection() as conn:
            cur = conn.execute(
                """
                INSERT INTO filtros_salvos (nome, tipo_busca, parametros)
                VALUES (?, ?, ?)
                """,
                (nome, tipo_busca, json.dumps(parametros, ensure_ascii=False)),
            )
            conn.commit()
            return cur.lastrowid or 0

    @staticmethod
    def list_filtros_salvos() -> list[dict[str, Any]]:
        with get_connection() as conn:
            cur = conn.execute("SELECT * FROM filtros_salvos ORDER BY criado_em DESC")
            rows = cur.fetchall()

        result = []
        for row in rows:
            d = dict(row)
            try:
                d["parametros"] = json.loads(d.get("parametros") or "{}")
            except Exception:
                d["parametros"] = {}
            result.append(d)
        return result

    @staticmethod
    def delete_filtro_salvo(filtro_id: int) -> bool:
        with get_connection() as conn:
            cur = conn.execute("DELETE FROM filtros_salvos WHERE id = ?", (filtro_id,))
            conn.commit()
            return cur.rowcount > 0

    # -----------------------------
    # CACHE MCP
    # -----------------------------
    @staticmethod
    def get_cache(cache_key: str) -> dict[str, Any] | None:
        now = int(time.time())
        with get_connection() as conn:
            cur = conn.execute(
                "SELECT response_json FROM cache_mcp WHERE cache_key = ? AND expires_at > ?",
                (cache_key, now),
            )
            row = cur.fetchone()
            if row:
                try:
                    return json.loads(row["response_json"])
                except Exception:
                    return None
        return None

    @staticmethod
    def set_cache(cache_key: str, data: dict[str, Any], ttl_seconds: int = 300) -> None:
        now = int(time.time())
        expires = now + ttl_seconds
        payload = json.dumps(data, ensure_ascii=False)
        with get_connection() as conn:
            conn.execute(
                """
                INSERT INTO cache_mcp (cache_key, response_json, expires_at, criado_em)
                VALUES (?, ?, ?, ?)
                ON CONFLICT(cache_key) DO UPDATE SET
                    response_json = excluded.response_json,
                    expires_at = excluded.expires_at,
                    criado_em = excluded.criado_em
                """,
                (cache_key, payload, expires, now),
            )
            conn.commit()

    @staticmethod
    def cleanup_expired_cache() -> int:
        now = int(time.time())
        with get_connection() as conn:
            cur = conn.execute("DELETE FROM cache_mcp WHERE expires_at <= ?", (now,))
            conn.commit()
            return cur.rowcount

    # -----------------------------
    # ESTATÍSTICAS GERAIS
    # -----------------------------
    @staticmethod
    def get_stats() -> dict[str, Any]:
        with get_connection() as conn:
            fav_concursos = conn.execute("SELECT COUNT(*) as c FROM favoritos_concursos").fetchone()["c"]
            fav_apostilas = conn.execute("SELECT COUNT(*) as c FROM favoritos_apostilas").fetchone()["c"]
            buscas = conn.execute("SELECT COUNT(*) as c FROM historico_buscas").fetchone()["c"]
            radares = conn.execute("SELECT COUNT(*) as c FROM filtros_salvos").fetchone()["c"]
            cached_entries = conn.execute("SELECT COUNT(*) as c FROM cache_mcp WHERE expires_at > ?", (int(time.time()),)).fetchone()["c"]
        return {
            "favoritos_concursos": fav_concursos,
            "favoritos_apostilas": fav_apostilas,
            "total_buscas": buscas,
            "radares_salvos": radares,
            "cache_entries": cached_entries,
        }
