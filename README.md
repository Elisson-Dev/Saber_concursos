# 🏛️ Saber Concursos — MCP Hub & Radar de Editais

[![Python](https://img.shields.io/badge/Python-3.12%2B-blue?logo=python&logoColor=white)](https://python.org)
[![FastAPI](https://img.shields.io/badge/FastAPI-0.115%2B-009688?logo=fastapi&logoColor=white)](https://fastapi.tiangolo.com)
[![Gerenciador uv](https://img.shields.io/badge/Package_Manager-uv-blueviolet?logo=astral&logoColor=white)](https://github.com/astral-sh/uv)
[![SQLite3](https://img.shields.io/badge/Database-SQLite3_WAL-003B57?logo=sqlite&logoColor=white)](https://www.sqlite.org/)
[![Docker](https://img.shields.io/badge/Docker-Ready-2496ED?logo=docker&logoColor=white)](https://www.docker.com/)
[![MCP](https://img.shields.io/badge/Model_Context_Protocol-2025--06--18-success)](https://www.pciconcursos.com.br/mcp-e-gpt)
[![License](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)

O **Saber Concursos** é uma plataforma moderna e de alto desempenho que conecta você diretamente ao conector oficial do **PCI Concursos MCP** (`https://mcp.pciconcursos.com.br/mcp`). 

Projetado com foco em **experiência do usuário (UX)**, **arquitetura limpa** e **persistência local em SQLite3**, o sistema roda tanto de forma nativa com **`uv`** quanto encapsulado em containers **Docker**.

---

## ✨ Funcionalidades Principais

| Módulo | Descrição |
| :--- | :--- |
| 🌐 **Explorar Editais** | Busca geral em tempo real com filtros por macrorregião (**Norte, Nordeste, Centro-Oeste, Sudeste, Sul, Nacional**), filtro opcional por **UF** e opção para vagas exclusivas de **Magistério / Professores**. |
| 💼 **Busca por Cargo** | Localização direta de oportunidades para cargos específicos (ex: *Advogado, Analista de TI, Enfermeiro, Guarda Municipal*), trazendo concursos do estado, macrorregião e nacionais. |
| 📍 **Busca por Cidade** | Localização de editais municipais e estaduais com normalização interna de acentos e espaços. |
| 📚 **Apostilas & Materiais** | Consulta de apostilas preparatórias digitais completas (PDFs), com quantidade de páginas, valores, opções de parcelamento e links diretos para o checkout oficial. |
| ⭐ **Central de Favoritos (SQLite3)** | Acompanhamento do ciclo de vida dos concursos com controle de status (*Interessado, Inscrito, Estudando, Prova Feita*) e anotações pessoais gravadas localmente. |
| 📡 **Radares Fixos & Histórico** | Criação de "Radares de Concursos" para reexecutar filtros customizados com apenas 1 clique, além de histórico de consultas. |
| ⏱️ **Prazos Pré-Calculados** | Badges dinâmicos de urgência (*"🔥 Restam 3 dias"*, *"Inscrições abertas"*), baseados nas datas oficiais fornecidas pelo servidor MCP sem risco de alucinação de datas. |
| ⚡ **Diagnóstico MCP em Tempo Real** | Painel com latência HTTP, versão do protocolo, instruções operacionais e catálogo das ferramentas ativas. |
| 🎨 **UX Premium no Navegador** | Interface Single Page Application (SPA), Dark/Light theme, glassmorphism e responsividade total para desktop e mobile. |

---

## 🏗️ Arquitetura do Sistema

```
Saber_concursos/
├── Dockerfile                  # Empacotamento Docker com UV
├── docker-compose.yml          # Orquestração 1-clique com volume persistente
├── pyproject.toml              # Especificação de dependências (Python >=3.12)
├── uv.lock                     # Lockfile determinístico do UV
├── data/                       # Diretório montado do banco SQLite
│   └── saber_concursos.db
└── src/
    └── saber_concursos/
        ├── __init__.py         # Pacote e exportação de entrypoint
        ├── config.py           # Configurações centralizadas via Dataclass / Env
        ├── main.py             # Entrypoint FastAPI, CORS e ciclo de vida
        ├── api/
        │   └── routes.py       # Endpoints REST e schemas Pydantic
        ├── db/
        │   ├── database.py     # Conexão SQLite3 com WAL mode e índices
        │   └── repository.py   # Camada de repositório (favoritos, histórico, radares, cache)
        ├── mcp/
        │   └── client.py       # Cliente JSON-RPC 2.0 sobre HTTP para o PCI MCP
        └── static/
            ├── index.html      # SPA acessível via navegador
            ├── css/
            │   └── styles.css  # Design system, glassmorphism e animações
            └── js/
                └── app.js      # Lógica reativa de navegação e integração
```

---

## 🚀 Como Executar

### Opção 1: Via Docker (Recomendado)

O projeto está 100% conteinerizado com suporte a volume persistente para o banco de dados SQLite.

1. **Suba o container com Docker Compose:**
   ```bash
   docker compose up --build -d
   ```

2. **Acesse a aplicação no navegador:**
   👉 [http://localhost:8000](http://localhost:8000)

3. **Verifique os logs ou a integridade:**
   ```bash
   docker compose logs -f
   ```

4. **Para parar o container:**
   ```bash
   docker compose down
   ```

---

### Opção 2: Localmente via `uv`

Como o ambiente já possui o gerenciador **`uv`**:

1. **Sincronize as dependências do projeto:**
   ```bash
   uv sync
   ```

2. **Inicie o servidor de desenvolvimento:**
   ```bash
   uv run saber-concursos
   ```
   *(Ou execute diretamente: `uv run python -m saber_concursos.main`)*

3. **Abra o navegador em:**
   👉 [http://localhost:8000](http://localhost:8000)

---

## 🗄️ Modelagem do Banco de Dados (SQLite3)

O banco de dados utiliza **WAL Mode (`PRAGMA journal_mode=WAL`)** e índices dedicados para máxima performance concorrente:

* **`favoritos_concursos`**: Concursos favoritados, órgão, vagas, remuneração, cargos (JSON), datas oficiais, status de preparação e notas pessoais.
* **`favoritos_apostilas`**: Materiais de estudo salvos com preço, parcelamento, link oficial de compra e capa.
* **`historico_buscas`**: Registro histórico de termos e filtros acionados pelo usuário.
* **`filtros_salvos` (Radares)**: Configurações de busca permanente para monitoramento contínuo.
* **`cache_mcp`**: Cache em memória/disco com TTL configurável para reduzir requisições redundantes e otimizar a velocidade de resposta.

---

## 🔌 Integração com o PCI Concursos MCP

O conector conecta-se à rota HTTP JSON-RPC 2.0 em `https://mcp.pciconcursos.com.br/mcp`:

| Ferramenta MCP | Parâmetros | Descrição |
| :--- | :--- | :--- |
| `listar_concursos` | `regiao` (opcional), `professores` (boolean) | Traz editais abertos por região brasileira. |
| `pesquisar_concursos`| `termo` (obrigatório), `uf` (opcional) | Pesquisa textual ampla em títulos, órgãos e cargos. |
| `buscar_por_cargo` | `cargo` (obrigatório), `uf` (opcional) | Localiza editais abertos para profissões específicas. |
| `buscar_por_cidade` | `uf` (obrigatório), `cidade` (obrigatório) | Busca concursos abertos num município específico. |
| `buscar_apostilas` | `termo` (obrigatório) | Busca apostilas digitais e PDFs preparatórios. |

---

## 📡 Referência da API REST

A aplicação expõe uma API REST documentada automaticamente via Swagger:
👉 [http://localhost:8000/docs](http://localhost:8000/docs)

* `GET /api/concursos/listar?regiao=...&professores=...`
* `GET /api/concursos/pesquisar?termo=...&uf=...`
* `GET /api/concursos/cargo?cargo=...&uf=...`
* `GET /api/concursos/cidade?cidade=...&uf=...`
* `GET /api/apostilas?termo=...`
* `GET|POST|DELETE|PATCH /api/favoritos/concursos`
* `GET|POST|DELETE /api/favoritos/apostilas`
* `GET|POST|DELETE /api/radares`
* `GET|DELETE /api/historico`
* `GET /api/mcp/health`
* `GET /api/stats`

---

## ⚙️ Variáveis de Ambiente

As configurações podem ser customizadas copiando `.env.example` para `.env` ou definindo variáveis no container:

| Variável | Padrão | Descrição |
| :--- | :--- | :--- |
| `HOST` | `0.0.0.0` | Endereço de bind do servidor |
| `PORT` | `8000` | Porta HTTP exposta |
| `PCI_MCP_URL` | `https://mcp.pciconcursos.com.br/mcp` | Endpoint oficial do PCI Concursos MCP |
| `SABER_DB_PATH` | `data/saber_concursos.db` | Caminho do arquivo SQLite local |
| `CACHE_TTL_SECONDS` | `300` | Tempo de vida do cache local em segundos (5 min) |
| `MCP_TIMEOUT_SECONDS` | `25.0` | Timeout máximo para requisições ao MCP |
| `DEBUG` | `false` | Ativa recarregamento automático e logs detalhados |

---

## 🛡️ Licença
Distribuído sob a licença [MIT](LICENSE).