"""Definição de rotas da API REST da aplicação Saber Concursos.
"""
from typing import Any
from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel, Field
from saber_concursos.db.repository import Repository
from saber_concursos.mcp.client import PCIMCPClient, MCPClientError, mcp_client

router = APIRouter(prefix="/api", tags=["API Saber Concursos"])


# --- Schemas de Entrada ---
class FavoritoConcursoInput(BaseModel):
    id: int | None = None
    noticia: dict[str, Any] = Field(default_factory=dict)
    datas: dict[str, Any] = Field(default_factory=dict)
    cargos: list[str] = Field(default_factory=list)
    vagas_salario: str = ""
    formacao: str = ""
    regiao: str = ""
    uf: str = ""
    titulo: str = ""
    orgao: str = ""
    apostila: dict[str, Any] | None = None
    status: str = "Interessado"
    notas: str = ""


class AtualizarFavoritoInput(BaseModel):
    status: str | None = None
    notas: str | None = None


class FavoritoApostilaInput(BaseModel):
    id: int
    colecao_id: int | None = None
    colecao_titulo: str = ""
    descricao: str
    paginas: int = 0
    preco: float = 0.0
    preco_formatado: str = ""
    parcelado_6x: str = ""
    imagem: str = ""
    link_compra: str = ""
    notas: str = ""


class RadarInput(BaseModel):
    nome: str
    tipo_busca: str
    parametros: dict[str, Any]


# =========================================================
# ROTAS DO MCP (CONCURSOS & APOSTILAS)
# =========================================================

@router.get("/concursos/listar")
async def listar_concursos(
    regiao: str | None = Query(None, description="Filtro opcional: norte, nordeste, centro-oeste, sudeste, sul"),
    professores: bool | None = Query(None, description="Filtrar apenas vagas para professores"),
    use_cache: bool = Query(True, description="Usar cache local do SQLite"),
):
    try:
        data = await mcp_client.listar_concursos(regiao=regiao, professores=professores, use_cache=use_cache)
        fav_ids = Repository.get_favoritos_concursos_ids()
        # Marca quais já estão favoritados
        for item in data.get("data", []):
            nid = (item.get("noticia") or {}).get("id") or item.get("id")
            item["_is_favorito"] = nid in fav_ids
        return data
    except MCPClientError as exc:
        raise HTTPException(status_code=502, detail=str(exc))


@router.get("/concursos/pesquisar")
async def pesquisar_concursos(
    termo: str = Query(..., min_length=1, description="Termo de busca livre"),
    uf: str | None = Query(None, description="Sigla do estado opcional (ex: sp, rj)"),
    use_cache: bool = Query(True, description="Usar cache local do SQLite"),
):
    try:
        data = await mcp_client.pesquisar_concursos(termo=termo, uf=uf, use_cache=use_cache)
        fav_ids = Repository.get_favoritos_concursos_ids()
        for item in data.get("data", []):
            nid = (item.get("noticia") or {}).get("id") or item.get("id")
            item["_is_favorito"] = nid in fav_ids
        return data
    except MCPClientError as exc:
        raise HTTPException(status_code=502, detail=str(exc))


@router.get("/concursos/cargo")
async def buscar_por_cargo(
    cargo: str = Query(..., min_length=1, description="Nome do cargo"),
    uf: str | None = Query(None, description="Sigla do estado opcional"),
    use_cache: bool = Query(True, description="Usar cache local do SQLite"),
):
    try:
        data = await mcp_client.buscar_por_cargo(cargo=cargo, uf=uf, use_cache=use_cache)
        fav_ids = Repository.get_favoritos_concursos_ids()
        for item in data.get("data", []):
            nid = (item.get("noticia") or {}).get("id") or item.get("id")
            item["_is_favorito"] = nid in fav_ids
        return data
    except MCPClientError as exc:
        raise HTTPException(status_code=502, detail=str(exc))


@router.get("/concursos/cidade")
async def buscar_por_cidade(
    cidade: str = Query(..., min_length=1, description="Nome da cidade"),
    uf: str = Query(..., min_length=2, max_length=2, description="Sigla do estado (ex: sp)"),
    use_cache: bool = Query(True, description="Usar cache local do SQLite"),
):
    try:
        data = await mcp_client.buscar_por_cidade(cidade=cidade, uf=uf, use_cache=use_cache)
        fav_ids = Repository.get_favoritos_concursos_ids()
        for item in data.get("data", []):
            nid = (item.get("noticia") or {}).get("id") or item.get("id")
            item["_is_favorito"] = nid in fav_ids
        return data
    except MCPClientError as exc:
        raise HTTPException(status_code=502, detail=str(exc))


@router.get("/apostilas")
async def buscar_apostilas(
    termo: str = Query(..., min_length=1, description="Termo para apostilas e materiais"),
    use_cache: bool = Query(True, description="Usar cache local do SQLite"),
):
    try:
        data = await mcp_client.buscar_apostilas(termo=termo, use_cache=use_cache)
        fav_ids = Repository.get_favoritos_apostilas_ids()
        for colecao in data.get("data", []):
            for apostila in colecao.get("apostilas", []):
                apostila["_is_favorito"] = apostila.get("id") in fav_ids
        return data
    except MCPClientError as exc:
        raise HTTPException(status_code=502, detail=str(exc))


# =========================================================
# FAVORITOS & ACOMPANHAMENTO (SQLITE3)
# =========================================================

@router.get("/favoritos/concursos")
async def listar_favoritos_concursos(status: str | None = Query(None)):
    return Repository.list_favoritos_concursos(status=status)


@router.post("/favoritos/concursos")
async def adicionar_favorito_concurso(payload: FavoritoConcursoInput):
    row_id = Repository.add_favorito_concurso(payload.model_dump())
    return {"success": True, "id": row_id}


@router.delete("/favoritos/concursos/{noticia_id}")
async def remover_favorito_concurso(noticia_id: int):
    success = Repository.remove_favorito_concurso(noticia_id)
    return {"success": success}


@router.patch("/favoritos/concursos/{noticia_id}")
async def atualizar_favorito_concurso(noticia_id: int, payload: AtualizarFavoritoInput):
    success = Repository.update_favorito_concurso(noticia_id, status=payload.status, notas=payload.notas)
    if not success:
        raise HTTPException(status_code=404, detail="Concurso favorito não encontrado.")
    return {"success": True}


@router.get("/favoritos/concursos/ids")
async def obter_ids_favoritos_concursos():
    return list(Repository.get_favoritos_concursos_ids())


@router.get("/favoritos/apostilas")
async def listar_favoritos_apostilas():
    return Repository.list_favoritos_apostilas()


@router.post("/favoritos/apostilas")
async def adicionar_favorito_apostila(payload: FavoritoApostilaInput):
    row_id = Repository.add_favorito_apostila(payload.model_dump())
    return {"success": True, "id": row_id}


@router.delete("/favoritos/apostilas/{apostila_id}")
async def remover_favorito_apostila(apostila_id: int):
    success = Repository.remove_favorito_apostila(apostila_id)
    return {"success": success}


# =========================================================
# HISTÓRICO & FILTROS SALVOS / RADARES
# =========================================================

@router.get("/historico")
async def listar_historico(limit: int = Query(50, le=200)):
    return Repository.list_historico(limit=limit)


@router.delete("/historico")
async def limpar_historico():
    Repository.clear_historico()
    return {"success": True, "message": "Histórico limpo com sucesso."}


@router.get("/radares")
async def listar_radares():
    return Repository.list_filtros_salvos()


@router.post("/radares")
async def criar_radar(payload: RadarInput):
    row_id = Repository.add_filtro_salvo(
        nome=payload.nome,
        tipo_busca=payload.tipo_busca,
        parametros=payload.parametros,
    )
    return {"success": True, "id": row_id}


@router.delete("/radares/{radar_id}")
async def remover_radar(radar_id: int):
    success = Repository.delete_filtro_salvo(radar_id)
    return {"success": success}


# =========================================================
# DIAGNÓSTICO DO MCP & ESTATÍSTICAS
# =========================================================

@router.get("/mcp/health")
async def verificar_saude_mcp():
    return await mcp_client.healthcheck()


@router.get("/mcp/tools")
async def listar_ferramentas_mcp():
    try:
        return await mcp_client.list_tools()
    except Exception as exc:
        raise HTTPException(status_code=502, detail=str(exc))


@router.post("/mcp/cache/cleanup")
async def limpar_cache_expirado():
    cleaned = Repository.cleanup_expired_cache()
    return {"success": True, "deleted_expired_count": cleaned}


@router.get("/stats")
async def obter_estatisticas():
    return Repository.get_stats()
