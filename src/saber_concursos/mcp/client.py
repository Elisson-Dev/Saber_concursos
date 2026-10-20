"""Cliente de integração MCP (Model Context Protocol) para o PCI Concursos.
Implementa o protocolo JSON-RPC 2.0 sobre transporte HTTP.
"""
import hashlib
import json
import logging
import time
from typing import Any
import httpx
from saber_concursos.config import settings
from saber_concursos.db.repository import Repository

logger = logging.getLogger(__name__)


class MCPClientError(Exception):
    """Exceção base para erros de comunicação com o servidor MCP."""
    pass


class PCIMCPClient:
    """Cliente para consumo das ferramentas expostas pelo MCP do PCI Concursos."""

    def __init__(self, mcp_url: str | None = None, timeout: float | None = None):
        self.mcp_url = mcp_url or settings.mcp_url
        self.timeout = timeout or settings.timeout_seconds
        self._request_id = 0

    def _next_id(self) -> int:
        self._request_id += 1
        return self._request_id

    def _generate_cache_key(self, tool_name: str, args: dict[str, Any]) -> str:
        serialized = json.dumps({"tool": tool_name, "args": args}, sort_keys=True)
        return hashlib.sha256(serialized.encode("utf-8")).hexdigest()

    async def _post_jsonrpc(self, method: str, params: dict[str, Any] | None = None) -> dict[str, Any]:
        req_id = self._next_id()
        payload = {
            "jsonrpc": "2.0",
            "id": req_id,
            "method": method,
            "params": params or {},
        }

        async with httpx.AsyncClient(timeout=self.timeout) as client:
            try:
                response = await client.post(
                    self.mcp_url,
                    json=payload,
                    headers={
                        "Content-Type": "application/json",
                        "Accept": "application/json",
                        "User-Agent": "SaberConcursos-MCPClient/1.0",
                    },
                )
                response.raise_for_status()
                data = response.json()
            except httpx.HTTPError as exc:
                logger.error("Erro HTTP ao chamar MCP %s: %s", method, exc)
                raise MCPClientError(f"Falha na requisição HTTP para o MCP: {exc}") from exc
            except Exception as exc:
                logger.error("Erro inesperado no cliente MCP: %s", exc)
                raise MCPClientError(f"Erro ao processar resposta do MCP: {exc}") from exc

        if "error" in data:
            err = data["error"]
            raise MCPClientError(f"Erro retornado pelo servidor MCP: {err.get('message', err)}")

        return data.get("result", {})

    async def initialize(self) -> dict[str, Any]:
        """Executa o handshake 'initialize' do MCP."""
        params = {
            "protocolVersion": "2024-11-05",
            "capabilities": {},
            "clientInfo": {
                "name": "Saber Concursos Client",
                "version": "1.0.0",
            },
        }
        return await self._post_jsonrpc("initialize", params)

    async def list_tools(self) -> list[dict[str, Any]]:
        """Retorna a lista de ferramentas disponíveis no servidor MCP."""
        result = await self._post_jsonrpc("tools/list", {})
        return result.get("tools", [])

    async def call_tool(
        self,
        tool_name: str,
        arguments: dict[str, Any],
        use_cache: bool = True,
        ttl_seconds: int | None = None,
    ) -> dict[str, Any]:
        """Invoca uma ferramenta remota do MCP com suporte a cache local SQLite."""
        cache_key = self._generate_cache_key(tool_name, arguments)
        ttl = ttl_seconds if ttl_seconds is not None else settings.cache_ttl_seconds

        if use_cache and ttl > 0:
            cached = Repository.get_cache(cache_key)
            if cached is not None:
                cached["_from_cache"] = True
                return cached

        params = {
            "name": tool_name,
            "arguments": arguments,
        }

        result = await self._post_jsonrpc("tools/call", params)
        content_list = result.get("content", [])

        parsed_data: dict[str, Any] = {"meta": {}, "data": [], "errors": []}
        for item in content_list:
            if item.get("type") == "text":
                text = item.get("text", "")
                try:
                    inner_json = json.loads(text)
                    if isinstance(inner_json, dict):
                        parsed_data = inner_json
                        break
                except Exception as e:
                    logger.warning("Não foi possível decodificar JSON interno de text: %s", e)
                    parsed_data = {"raw_text": text}

        # Salva em cache se obteve dados válidos
        if use_cache and ttl > 0 and parsed_data:
            Repository.set_cache(cache_key, parsed_data, ttl_seconds=ttl)

        parsed_data["_from_cache"] = False
        return parsed_data

    # -----------------------------
    # FERRAMENTAS ESPECÍFICAS PCI
    # -----------------------------
    async def listar_concursos(
        self,
        regiao: str | None = None,
        professores: bool | None = None,
        use_cache: bool = True,
    ) -> dict[str, Any]:
        """Lista concursos públicos com filtros opcionais de região e professores."""
        args: dict[str, Any] = {}
        if regiao and regiao.strip().lower() != "todas":
            args["regiao"] = regiao.strip().lower()
        if professores is not None:
            args["professores"] = bool(professores)

        result = await self.call_tool("listar_concursos", args, use_cache=use_cache)
        Repository.add_historico(
            tipo_busca="listar",
            termo=regiao or "Todas as regiões",
            filtros=args,
            total_resultados=len(result.get("data", [])),
        )
        return result

    async def pesquisar_concursos(
        self,
        termo: str,
        uf: str | None = None,
        use_cache: bool = True,
    ) -> dict[str, Any]:
        """Busca concursos por termo livre em título, órgão ou cargo."""
        args: dict[str, Any] = {"termo": termo.strip()}
        if uf and uf.strip():
            args["uf"] = uf.strip().lower()

        result = await self.call_tool("pesquisar_concursos", args, use_cache=use_cache)
        Repository.add_historico(
            tipo_busca="pesquisar",
            termo=termo,
            filtros=args,
            total_resultados=len(result.get("data", [])),
        )
        return result

    async def buscar_por_cargo(
        self,
        cargo: str,
        uf: str | None = None,
        use_cache: bool = True,
    ) -> dict[str, Any]:
        """Busca editais abertos por cargo específico."""
        args: dict[str, Any] = {"cargo": cargo.strip()}
        if uf and uf.strip():
            args["uf"] = uf.strip().lower()

        result = await self.call_tool("buscar_por_cargo", args, use_cache=use_cache)
        Repository.add_historico(
            tipo_busca="cargo",
            termo=cargo,
            filtros=args,
            total_resultados=len(result.get("data", [])),
        )
        return result

    async def buscar_por_cidade(
        self,
        cidade: str,
        uf: str,
        use_cache: bool = True,
    ) -> dict[str, Any]:
        """Busca editais abertos numa cidade específica."""
        args = {
            "cidade": cidade.strip(),
            "uf": uf.strip().lower(),
        }

        result = await self.call_tool("buscar_por_cidade", args, use_cache=use_cache)
        Repository.add_historico(
            tipo_busca="cidade",
            termo=f"{cidade} - {uf.upper()}",
            filtros=args,
            total_resultados=len(result.get("data", [])),
        )
        return result

    async def buscar_apostilas(
        self,
        termo: str,
        use_cache: bool = True,
    ) -> dict[str, Any]:
        """Busca apostilas digitais (PDFs preparatórios) com preços e links de checkout."""
        args = {"termo": termo.strip()}

        result = await self.call_tool("buscar_apostilas", args, use_cache=use_cache)
        data = result.get("data", [])
        total = sum(len(c.get("apostilas", [])) for c in data) if data else 0

        Repository.add_historico(
            tipo_busca="apostilas",
            termo=termo,
            filtros=args,
            total_resultados=total,
        )
        return result

    async def healthcheck(self) -> dict[str, Any]:
        """Verifica a saúde da conexão direta com o servidor MCP e mede a latência."""
        start = time.perf_counter()
        try:
            init_res = await self.initialize()
            tools = await self.list_tools()
            latency_ms = round((time.perf_counter() - start) * 1000, 2)
            return {
                "status": "online",
                "mcp_url": self.mcp_url,
                "latency_ms": latency_ms,
                "server_info": init_res.get("serverInfo", {}),
                "protocol_version": init_res.get("protocolVersion"),
                "instructions": init_res.get("instructions"),
                "tools_count": len(tools),
                "tools": tools,
            }
        except Exception as exc:
            latency_ms = round((time.perf_counter() - start) * 1000, 2)
            return {
                "status": "offline",
                "mcp_url": self.mcp_url,
                "latency_ms": latency_ms,
                "error": str(exc),
            }


mcp_client = PCIMCPClient()
