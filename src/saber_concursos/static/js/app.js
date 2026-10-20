/**
 * SABER CONCURSOS — FRONTEND ENGINE
 * Integração completa com PCI Concursos MCP e SQLite3
 */

// Estado da Aplicação
const state = {
    activeTab: 'explorar',
    favoritosConcursoIds: new Set(),
    favoritosApostilaIds: new Set(),
    currentModalConcurso: null,
    pendingRadar: null,
    mcpHealth: null,
};

// ==========================================================================
// INICIALIZAÇÃO
// ==========================================================================
document.addEventListener('DOMContentLoaded', () => {
    initTheme();
    setupNavigation();
    setupForms();
    setupModals();
    checkMCPHealth();
    loadFavoritosIds();
    loadInitialConcursos();
    loadRadares();
    loadHistorico();
});

// ==========================================================================
// TEMA DARK / LIGHT
// ==========================================================================
function initTheme() {
    const savedTheme = localStorage.getItem('saber_theme') || 'dark';
    document.documentElement.setAttribute('data-theme', savedTheme);

    const toggleBtn = document.getElementById('theme-toggle');
    if (toggleBtn) {
        toggleBtn.addEventListener('click', () => {
            const current = document.documentElement.getAttribute('data-theme');
            const next = current === 'dark' ? 'light' : 'dark';
            document.documentElement.setAttribute('data-theme', next);
            localStorage.setItem('saber_theme', next);
        });
    }
}

// ==========================================================================
// NAVEGAÇÃO DE ABAS
// ==========================================================================
function setupNavigation() {
    const tabs = document.querySelectorAll('.nav-tab');
    tabs.forEach(tab => {
        tab.addEventListener('click', () => {
            const targetId = tab.dataset.tab;
            switchTab(targetId);
        });
    });

    // Subabas de favoritos
    const favSubtabs = document.querySelectorAll('.fav-subtab');
    favSubtabs.forEach(btn => {
        btn.addEventListener('click', () => {
            favSubtabs.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            const sub = btn.dataset.favSub;
            document.getElementById('fav-sub-concursos').classList.toggle('active', sub === 'concursos');
            document.getElementById('fav-sub-apostilas').classList.toggle('active', sub === 'apostilas');
        });
    });

    // Filtros de status de favoritos
    const statusChips = document.querySelectorAll('.chip-status');
    statusChips.forEach(chip => {
        chip.addEventListener('click', () => {
            statusChips.forEach(c => c.classList.remove('active'));
            chip.classList.add('active');
            loadFavoritosConcursos(chip.dataset.status);
        });
    });
}

function switchTab(tabId) {
    state.activeTab = tabId;
    document.querySelectorAll('.nav-tab').forEach(t => {
        const isActive = t.dataset.tab === tabId;
        t.classList.toggle('active', isActive);
        t.setAttribute('aria-selected', isActive ? 'true' : 'false');
    });

    document.querySelectorAll('.tab-content').forEach(content => {
        content.classList.toggle('active', content.id === `tab-${tabId}`);
    });

    if (tabId === 'favoritos') {
        loadFavoritosConcursos();
        loadFavoritosApostilas();
    } else if (tabId === 'radares') {
        loadRadares();
        loadHistorico();
    } else if (tabId === 'mcp-info') {
        checkMCPHealth();
    }
}

// ==========================================================================
// SAÚDE DO MCP & DIAGNÓSTICO
// ==========================================================================
async function checkMCPHealth() {
    const pill = document.getElementById('mcp-status-pill');
    const text = document.getElementById('mcp-status-text');
    const latency = document.getElementById('mcp-latency');

    try {
        const res = await fetch('/api/mcp/health');
        const data = await res.json();
        state.mcpHealth = data;

        if (data.status === 'online') {
            pill.className = 'status-pill status-online';
            text.textContent = 'PCI MCP Online';
            latency.textContent = `${data.latency_ms} ms`;

            // Atualiza aba MCP Info
            document.getElementById('metric-mcp-status').textContent = 'Conectado (200 OK)';
            document.getElementById('metric-mcp-status').className = 'badge-success';
            document.getElementById('metric-mcp-latency').textContent = `${data.latency_ms} ms`;
            document.getElementById('metric-mcp-protocol').textContent = data.protocol_version || '2025-06-18';
            document.getElementById('metric-mcp-tools-count').textContent = data.tools_count || 5;
            document.getElementById('mcp-instructions-text').textContent = data.instructions || 'Instruções carregadas.';

            renderMCPTools(data.tools || []);
        } else {
            pill.className = 'status-pill status-offline';
            text.textContent = 'PCI MCP Desconectado';
            latency.textContent = 'Erro';
            document.getElementById('metric-mcp-status').textContent = 'Erro de Conexão';
            document.getElementById('metric-mcp-status').className = 'badge-dias urgente';
        }
    } catch (err) {
        pill.className = 'status-pill status-offline';
        text.textContent = 'Servidor Offline';
        latency.textContent = 'Falha';
    }
}

function renderMCPTools(tools) {
    const container = document.getElementById('mcp-tools-list');
    if (!container) return;

    container.innerHTML = tools.map(t => `
        <div class="tool-card">
            <div>
                <h4>${escapeHtml(t.name)}</h4>
                <p class="tool-desc">${escapeHtml(t.description || 'Sem descrição')}</p>
            </div>
            <div class="code-box text-xs">
                <span>Parâmetros: ${Object.keys(t.inputSchema?.properties || {}).join(', ') || 'Nenhum'}</span>
            </div>
        </div>
    `).join('');
}

// ==========================================================================
// CONSULTAS MCP & FORMS
// ==========================================================================
function setupForms() {
    // ABA 1: Pesquisa Geral / Região
    const formGeral = document.getElementById('form-pesquisa-geral');
    if (formGeral) {
        formGeral.addEventListener('submit', (e) => {
            e.preventDefault();
            executarBuscaGeral();
        });
    }

    // Chips de Região
    const regionChips = document.querySelectorAll('#region-chips .chip');
    regionChips.forEach(chip => {
        chip.addEventListener('click', () => {
            regionChips.forEach(c => c.classList.remove('active'));
            chip.classList.add('active');
            executarBuscaGeral();
        });
    });

    // Checkbox Professores
    const checkProf = document.getElementById('check-professores');
    if (checkProf) {
        checkProf.addEventListener('change', () => {
            executarBuscaGeral();
        });
    }

    // Tags Populares
    document.querySelectorAll('.quick-tag').forEach(tag => {
        tag.addEventListener('click', () => {
            document.getElementById('input-termo-geral').value = tag.dataset.tag;
            executarBuscaGeral();
        });
    });

    // Refresh Explorar
    const refreshBtn = document.getElementById('btn-refresh-explorar');
    if (refreshBtn) {
        refreshBtn.addEventListener('click', () => executarBuscaGeral(false));
    }

    // Botão Salvar Radar Geral
    const btnSaveRadarGeral = document.getElementById('btn-save-radar-geral');
    if (btnSaveRadarGeral) {
        btnSaveRadarGeral.addEventListener('click', () => {
            abrirModalSalvarRadar('explorar');
        });
    }

    // ABA 2: Busca por Cargo
    const formCargo = document.getElementById('form-pesquisa-cargo');
    if (formCargo) {
        formCargo.addEventListener('submit', (e) => {
            e.preventDefault();
            executarBuscaCargo();
        });
    }

    document.querySelectorAll('.quick-tag-cargo').forEach(tag => {
        tag.addEventListener('click', () => {
            document.getElementById('input-cargo').value = tag.dataset.cargo;
            executarBuscaCargo();
        });
    });

    // ABA 3: Busca por Cidade
    const formCidade = document.getElementById('form-pesquisa-cidade');
    if (formCidade) {
        formCidade.addEventListener('submit', (e) => {
            e.preventDefault();
            executarBuscaCidade();
        });
    }

    document.querySelectorAll('.quick-tag-cidade').forEach(tag => {
        tag.addEventListener('click', () => {
            document.getElementById('select-uf-cidade').value = tag.dataset.uf;
            document.getElementById('input-cidade').value = tag.dataset.cidade;
            executarBuscaCidade();
        });
    });

    // ABA 4: Apostilas
    const formApostilas = document.getElementById('form-pesquisa-apostilas');
    if (formApostilas) {
        formApostilas.addEventListener('submit', (e) => {
            e.preventDefault();
            executarBuscaApostilas();
        });
    }

    document.querySelectorAll('.quick-tag-apostila').forEach(tag => {
        tag.addEventListener('click', () => {
            document.getElementById('input-termo-apostila').value = tag.dataset.termo;
            executarBuscaApostilas();
        });
    });

    // Botão limpar histórico
    const btnLimparHist = document.getElementById('btn-limpar-historico');
    if (btnLimparHist) {
        btnLimparHist.addEventListener('click', async () => {
            if (confirm('Deseja realmente limpar todo o histórico de buscas?')) {
                await fetch('/api/historico', { method: 'DELETE' });
                showToast('Histórico limpo com sucesso!', 'success');
                loadHistorico();
            }
        });
    }

    // Botão retestar MCP
    const btnRetestMCP = document.getElementById('btn-retest-mcp');
    if (btnRetestMCP) {
        btnRetestMCP.addEventListener('click', () => {
            showToast('Verificando conexão...', 'info');
            checkMCPHealth();
        });
    }

    // Botão limpar cache expirado
    const btnCleanCache = document.getElementById('btn-clean-cache');
    if (btnCleanCache) {
        btnCleanCache.addEventListener('click', async () => {
            const res = await fetch('/api/mcp/cache/cleanup', { method: 'POST' });
            const data = await res.json();
            showToast(`${data.deleted_expired_count} registros de cache limpos.`, 'success');
        });
    }
}

// ==========================================================================
// EXECUÇÃO DAS BUSCAS
// ==========================================================================

async function loadInitialConcursos() {
    executarBuscaGeral();
}

async function executarBuscaGeral(useCache = true) {
    const termo = document.getElementById('input-termo-geral').value.trim();
    const uf = document.getElementById('select-uf-geral').value;
    const activeChip = document.querySelector('#region-chips .chip.active');
    const regiao = activeChip ? activeChip.dataset.regiao : 'todas';
    const professores = document.getElementById('check-professores').checked;

    const cardsContainer = document.getElementById('cards-explorar');
    const titleEl = document.getElementById('explorar-title');
    const countEl = document.getElementById('explorar-count');

    renderSkeletons(cardsContainer, 6);
    countEl.textContent = 'Consultando PCI MCP...';

    let url = '';
    if (termo) {
        // Se houver termo, usa pesquisar_concursos
        const params = new URLSearchParams({ termo, use_cache: useCache });
        if (uf) params.append('uf', uf);
        url = `/api/concursos/pesquisar?${params.toString()}`;
        titleEl.textContent = `Resultados para "${termo}" ${uf ? `(${uf.toUpperCase()})` : ''}`;
    } else {
        // Sem termo, usa listar_concursos
        const params = new URLSearchParams({ use_cache: useCache });
        if (regiao && regiao !== 'todas') params.append('regiao', regiao);
        if (professores) params.append('professores', 'true');
        url = `/api/concursos/listar?${params.toString()}`;
        titleEl.textContent = `Concursos Abertos — ${regiao.toUpperCase()}${professores ? ' (Professores)' : ''}`;
    }

    try {
        const res = await fetch(url);
        if (!res.ok) throw new Error('Falha na resposta do servidor');
        const data = await res.json();
        const items = data.data || [];
        countEl.textContent = `${items.length} editais encontrados`;

        if (items.length === 0) {
            cardsContainer.innerHTML = `
                <div class="empty-state">
                    <p>Nenhum concurso encontrado para os critérios selecionados.</p>
                </div>
            `;
            return;
        }

        renderConcursosCards(cardsContainer, items);
        loadHistorico();
    } catch (err) {
        cardsContainer.innerHTML = `
            <div class="empty-state">
                <p>Erro ao consultar o servidor PCI MCP: ${escapeHtml(err.message)}</p>
            </div>
        `;
        countEl.textContent = 'Erro';
    }
}

async function executarBuscaCargo() {
    const cargo = document.getElementById('input-cargo').value.trim();
    if (!cargo) return;

    const uf = document.getElementById('select-uf-cargo').value;
    const cardsContainer = document.getElementById('cards-cargo');
    const titleEl = document.getElementById('cargo-title');
    const countEl = document.getElementById('cargo-count');

    renderSkeletons(cardsContainer, 6);
    countEl.textContent = 'Consultando...';

    const params = new URLSearchParams({ cargo });
    if (uf) params.append('uf', uf);

    try {
        const res = await fetch(`/api/concursos/cargo?${params.toString()}`);
        if (!res.ok) throw new Error('Falha ao buscar por cargo');
        const data = await res.json();
        const items = data.data || [];

        titleEl.textContent = `Editais Abertos para "${cargo}" ${uf ? `em ${uf.toUpperCase()}` : ''}`;
        countEl.textContent = `${items.length} concursos`;

        if (items.length === 0) {
            cardsContainer.innerHTML = `
                <div class="empty-state">
                    <p>Nenhum concurso aberto encontrado para o cargo "${escapeHtml(cargo)}".</p>
                </div>
            `;
            return;
        }

        renderConcursosCards(cardsContainer, items);
        loadHistorico();
    } catch (err) {
        cardsContainer.innerHTML = `<div class="empty-state"><p>${escapeHtml(err.message)}</p></div>`;
    }
}

async function executarBuscaCidade() {
    const uf = document.getElementById('select-uf-cidade').value;
    const cidade = document.getElementById('input-cidade').value.trim();
    if (!uf || !cidade) {
        showToast('Informe o Estado (UF) e o nome da cidade.', 'error');
        return;
    }

    const cardsContainer = document.getElementById('cards-cidade');
    const titleEl = document.getElementById('cidade-title');
    const countEl = document.getElementById('cidade-count');

    renderSkeletons(cardsContainer, 4);
    countEl.textContent = 'Consultando...';

    const params = new URLSearchParams({ cidade, uf });

    try {
        const res = await fetch(`/api/concursos/cidade?${params.toString()}`);
        if (!res.ok) throw new Error('Falha ao buscar por cidade');
        const data = await res.json();
        const items = data.data || [];

        titleEl.textContent = `Concursos Abertos em ${cidade} (${uf.toUpperCase()})`;
        countEl.textContent = `${items.length} editais`;

        if (items.length === 0) {
            cardsContainer.innerHTML = `
                <div class="empty-state">
                    <p>Nenhum concurso municipal ou regional aberto encontrado em ${escapeHtml(cidade)} - ${uf.toUpperCase()}.</p>
                </div>
            `;
            return;
        }

        renderConcursosCards(cardsContainer, items);
        loadHistorico();
    } catch (err) {
        cardsContainer.innerHTML = `<div class="empty-state"><p>${escapeHtml(err.message)}</p></div>`;
    }
}

async function executarBuscaApostilas() {
    const termo = document.getElementById('input-termo-apostila').value.trim();
    if (!termo) return;

    const cardsContainer = document.getElementById('cards-apostilas');
    const titleEl = document.getElementById('apostilas-title');
    const countEl = document.getElementById('apostilas-count');

    renderSkeletons(cardsContainer, 4);
    countEl.textContent = 'Consultando materiais...';

    try {
        const res = await fetch(`/api/apostilas?termo=${encodeURIComponent(termo)}`);
        if (!res.ok) throw new Error('Falha ao buscar apostilas');
        const data = await res.json();
        const colecoes = data.data || [];

        // Flatten das apostilas com referência da coleção
        const listaApostilas = [];
        colecoes.forEach(col => {
            (col.apostilas || []).forEach(ap => {
                listaApostilas.push({
                    ...ap,
                    colecao_id: col.colecao_id,
                    colecao_titulo: col.titulo,
                });
            });
        });

        titleEl.textContent = `Apostilas para "${termo}"`;
        countEl.textContent = `${listaApostilas.length} materiais encontrados`;

        if (listaApostilas.length === 0) {
            cardsContainer.innerHTML = `
                <div class="empty-state">
                    <p>Nenhuma apostila preparatória encontrada para "${escapeHtml(termo)}".</p>
                </div>
            `;
            return;
        }

        renderApostilasCards(cardsContainer, listaApostilas);
        loadHistorico();
    } catch (err) {
        cardsContainer.innerHTML = `<div class="empty-state"><p>${escapeHtml(err.message)}</p></div>`;
    }
}

// ==========================================================================
// RENDERIZAÇÃO DE CARDS
// ==========================================================================

function renderSkeletons(container, count = 4) {
    container.innerHTML = Array(count).fill('<div class="skeleton-card"></div>').join('');
}

function renderConcursosCards(container, items) {
    container.innerHTML = items.map((item, idx) => {
        const noticia = item.noticia || {};
        const datas = item.datas || {};
        const noticiaId = noticia.id || item.id || idx;
        const isFav = state.favoritosConcursoIds.has(noticiaId) || item._is_favorito;
        const diasRestantes = datas.dias_restantes;
        const isUrgente = diasRestantes !== undefined && diasRestantes <= 5 && diasRestantes >= 0;

        const cargos = item.cargos || [];
        const previewCargos = cargos.slice(0, 2);
        const extraCargos = cargos.length - previewCargos.length;

        // Serialize seguro para o modal
        const jsonSafe = encodeURIComponent(JSON.stringify(item));

        return `
            <div class="concurso-card" data-id="${noticiaId}">
                <div class="card-top">
                    <div class="card-badges">
                        <span class="badge-uf">${escapeHtml(item.uf || 'BR')}</span>
                        ${diasRestantes !== undefined ? `
                            <span class="badge-dias ${isUrgente ? 'urgente' : ''}">
                                ${diasRestantes >= 0 ? `Restam ${diasRestantes} dias` : 'Encerrado'}
                            </span>
                        ` : ''}
                        ${item.formacao ? `<span class="badge-formacao">${escapeHtml(item.formacao)}</span>` : ''}
                    </div>
                    <button class="btn-fav ${isFav ? 'active' : ''}" 
                            title="${isFav ? 'Remover dos favoritos' : 'Favoritar este concurso'}"
                            onclick="toggleFavoritoConcurso('${jsonSafe}')">
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="${isFav ? 'currentColor' : 'none'}" stroke="currentColor" stroke-width="2">
                            <path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z"/>
                        </svg>
                    </button>
                </div>

                <h4 class="card-title" title="${escapeHtml(noticia.titulo || item.titulo || '')}">
                    ${escapeHtml(noticia.titulo || item.titulo || 'Concurso sem título')}
                </h4>

                <div class="card-vagas-salario">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M16 8h-6a2 2 0 1 0 0 4h4a2 2 0 1 1 0 4H8M12 6v2M12 16v2"/></svg>
                    <span>${escapeHtml(item.vagas_salario || 'Vagas conforme edital')}</span>
                </div>

                <div class="card-cargos">
                    <ul class="cargos-preview-list">
                        ${previewCargos.map(c => `<li class="cargo-preview-item" title="${escapeHtml(c)}">${escapeHtml(c)}</li>`).join('')}
                    </ul>
                    ${extraCargos > 0 ? `<div class="more-cargos-tag" onclick="abrirModalConcurso('${jsonSafe}')">+ ${extraCargos} outros cargos...</div>` : ''}
                </div>

                <div class="card-datas-row">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect width="18" height="18" x="3" y="4" rx="2" ry="2"/><line x1="16" x2="16" y1="2" y2="6"/><line x1="8" x2="8" y1="2" y2="6"/><line x1="3" x2="21" y1="10" y2="10"/></svg>
                    <span>Inscrições: ${datas.inicio || '--'} até <strong>${datas.fim || '--'}</strong></span>
                </div>

                <div class="card-footer-actions">
                    <button class="btn-card-details" onclick="abrirModalConcurso('${jsonSafe}')">Ver Detalhes</button>
                    ${noticia.link ? `
                        <a href="${escapeHtml(noticia.link)}" target="_blank" rel="noopener" class="btn-card-link" title="Abrir Notícia Oficial">
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6M15 3h6v6M10 14 21 3"/></svg>
                        </a>
                    ` : ''}
                </div>
            </div>
        `;
    }).join('');
}

function renderApostilasCards(container, apostilas) {
    container.innerHTML = apostilas.map(item => {
        const isFav = state.favoritosApostilaIds.has(item.id) || item._is_favorito;
        const jsonSafe = encodeURIComponent(JSON.stringify(item));

        return `
            <div class="apostila-card" data-id="${item.id}">
                <div>
                    <div class="apostila-header">
                        ${item.imagem ? `
                            <img src="${escapeHtml(item.imagem)}" alt="${escapeHtml(item.descricao)}" class="apostila-cover" loading="lazy" onerror="this.style.display='none'">
                        ` : ''}
                        <div class="apostila-info">
                            <h4 class="apostila-title" title="${escapeHtml(item.descricao)}">
                                ${escapeHtml(item.descricao)}
                            </h4>
                            <div class="apostila-meta">
                                <span>${escapeHtml(item.colecao_titulo || '')}</span> • 
                                <span>${item.paginas || 0} páginas</span>
                            </div>
                        </div>
                    </div>

                    <div class="apostila-price-row">
                        <span class="price-main">${escapeHtml(item.preco_formatado || `R$ ${item.preco}`)}</span>
                        ${item.parcelado_6x ? `<span class="price-parcelado">ou 6x de ${escapeHtml(item.parcelado_6x)}</span>` : ''}
                    </div>
                </div>

                <div class="apostila-actions">
                    ${item.link_compra ? `
                        <a href="${escapeHtml(item.link_compra)}" target="_blank" rel="noopener" class="btn-buy-apostila">
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4Z"/><path d="M3 6h18"/><path d="M16 10a4 4 0 0 1-8 0"/></svg>
                            <span>Comprar Apostila</span>
                        </a>
                    ` : ''}
                    <button class="btn-icon ${isFav ? 'active' : ''}" 
                            title="${isFav ? 'Remover dos favoritos' : 'Favoritar apostila'}"
                            onclick="toggleFavoritoApostila('${jsonSafe}')">
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="${isFav ? 'currentColor' : 'none'}" stroke="currentColor" stroke-width="2">
                            <path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z"/>
                        </svg>
                    </button>
                </div>
            </div>
        `;
    }).join('');
}

// ==========================================================================
// MODAL DE DETALHES DO CONCURSO
// ==========================================================================
function setupModals() {
    const modalConcurso = document.getElementById('modal-concurso');
    const btnCloseModal = document.getElementById('btn-close-modal');
    if (btnCloseModal && modalConcurso) {
        btnCloseModal.addEventListener('click', () => modalConcurso.close());
    }

    const modalRadar = document.getElementById('modal-radar');
    const btnCloseRadar = document.getElementById('btn-close-modal-radar');
    if (btnCloseRadar && modalRadar) {
        btnCloseRadar.addEventListener('click', () => modalRadar.close());
    }

    // Salvar notas no modal
    const btnSalvarNotas = document.getElementById('modal-btn-salvar-notas');
    if (btnSalvarNotas) {
        btnSalvarNotas.addEventListener('click', salvarNotasModal);
    }

    // Confirmar radar
    const btnConfirmarRadar = document.getElementById('btn-confirmar-radar');
    if (btnConfirmarRadar) {
        btnConfirmarRadar.addEventListener('click', confirmarSalvarRadar);
    }
}

function abrirModalConcurso(jsonStr) {
    const item = JSON.parse(decodeURIComponent(jsonStr));
    state.currentModalConcurso = item;

    const modal = document.getElementById('modal-concurso');
    const noticia = item.noticia || {};
    const datas = item.datas || {};
    const noticiaId = noticia.id || item.id;
    const isFav = state.favoritosConcursoIds.has(noticiaId);

    document.getElementById('modal-uf-badge').textContent = item.uf || 'BR';
    document.getElementById('modal-concurso-titulo').textContent = noticia.titulo || item.titulo || 'Concurso';
    document.getElementById('modal-orgao').textContent = item.orgao || noticia.titulo || '--';
    document.getElementById('modal-vagas-salario').textContent = item.vagas_salario || 'A consultar no edital';
    document.getElementById('modal-formacao').textContent = item.formacao || 'Diversas escolaridades';
    document.getElementById('modal-datas').textContent = `Início: ${datas.inicio || '--'} | Término: ${datas.fim || '--'} (${datas.dias_restantes !== undefined ? datas.dias_restantes + ' dias restantes' : ''})`;

    const cargosList = document.getElementById('modal-cargos-list');
    const cargos = item.cargos || [];
    cargosList.innerHTML = cargos.length > 0 
        ? cargos.map(c => `<li>• ${escapeHtml(c)}</li>`).join('')
        : '<li>Cargos descritos na notícia oficial.</li>';

    // Controles de favorito no modal
    const selectStatus = document.getElementById('modal-select-status');
    selectStatus.value = item.status || 'Interessado';

    const favBtnLabel = document.getElementById('modal-fav-btn-label');
    favBtnLabel.textContent = isFav ? 'Remover dos Favoritos' : 'Favoritar Concurso';

    const modalBtnToggleFav = document.getElementById('modal-btn-toggle-fav');
    modalBtnToggleFav.onclick = () => {
        toggleFavoritoConcurso(jsonStr);
        const novoStatus = state.favoritosConcursoIds.has(noticiaId);
        favBtnLabel.textContent = novoStatus ? 'Remover dos Favoritos' : 'Favoritar Concurso';
    };

    const notesTextarea = document.getElementById('modal-notas');
    notesTextarea.value = item.notas || '';

    // Links externos
    const linkNoticia = document.getElementById('modal-link-noticia');
    if (noticia.link) {
        linkNoticia.href = noticia.link;
        linkNoticia.style.display = 'inline-flex';
    } else {
        linkNoticia.style.display = 'none';
    }

    const linkApostila = document.getElementById('modal-link-apostila');
    const apostLink = (item.apostila && item.apostila.link) || item.link_apostila;
    if (apostLink) {
        linkApostila.href = apostLink;
        linkApostila.style.display = 'inline-flex';
    } else {
        linkApostila.style.display = 'none';
    }

    modal.showModal();
}

async function salvarNotasModal() {
    if (!state.currentModalConcurso) return;
    const noticia = state.currentModalConcurso.noticia || {};
    const noticiaId = noticia.id || state.currentModalConcurso.id;
    const status = document.getElementById('modal-select-status').value;
    const notas = document.getElementById('modal-notas').value;

    // Se ainda não for favorito, adiciona primeiro
    if (!state.favoritosConcursoIds.has(noticiaId)) {
        await toggleFavoritoConcurso(encodeURIComponent(JSON.stringify(state.currentModalConcurso)));
    }

    try {
        const res = await fetch(`/api/favoritos/concursos/${noticiaId}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ status, notas }),
        });
        if (res.ok) {
            showToast('Anotações e status atualizados no SQLite!', 'success');
            if (state.activeTab === 'favoritos') {
                loadFavoritosConcursos();
            }
        }
    } catch (err) {
        showToast('Falha ao salvar anotações.', 'error');
    }
}

// ==========================================================================
// FAVORITOS (CRUD)
// ==========================================================================

async function loadFavoritosIds() {
    try {
        const [resConcursos, resApostilas] = await Promise.all([
            fetch('/api/favoritos/concursos/ids'),
            fetch('/api/stats'),
        ]);
        const ids = await resConcursos.json();
        state.favoritosConcursoIds = new Set(ids);

        const stats = await resApostilas.json();
        const badge = document.getElementById('fav-count-badge');
        if (badge) {
            badge.textContent = (stats.favoritos_concursos || 0) + (stats.favoritos_apostilas || 0);
        }
    } catch (err) {
        console.error('Erro ao carregar IDs favoritos:', err);
    }
}

async function toggleFavoritoConcurso(jsonStr) {
    const item = JSON.parse(decodeURIComponent(jsonStr));
    const noticia = item.noticia || {};
    const noticiaId = noticia.id || item.id;

    if (state.favoritosConcursoIds.has(noticiaId)) {
        // Remover
        try {
            await fetch(`/api/favoritos/concursos/${noticiaId}`, { method: 'DELETE' });
            state.favoritosConcursoIds.delete(noticiaId);
            showToast('Concurso removido dos favoritos.', 'info');
        } catch (err) {
            showToast('Erro ao remover favorito.', 'error');
        }
    } else {
        // Adicionar
        try {
            await fetch('/api/favoritos/concursos', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(item),
            });
            state.favoritosConcursoIds.add(noticiaId);
            showToast('Concurso salvo em Meus Favoritos!', 'success');
        } catch (err) {
            showToast('Erro ao favoritar concurso.', 'error');
        }
    }

    loadFavoritosIds();
    // Atualiza botões no DOM
    document.querySelectorAll(`.concurso-card[data-id="${noticiaId}"] .btn-fav`).forEach(btn => {
        const active = state.favoritosConcursoIds.has(noticiaId);
        btn.classList.toggle('active', active);
        btn.querySelector('svg').setAttribute('fill', active ? 'currentColor' : 'none');
    });

    if (state.activeTab === 'favoritos') {
        loadFavoritosConcursos();
    }
}

async function toggleFavoritoApostila(jsonStr) {
    const item = JSON.parse(decodeURIComponent(jsonStr));
    const id = item.id;

    if (state.favoritosApostilaIds.has(id)) {
        await fetch(`/api/favoritos/apostilas/${id}`, { method: 'DELETE' });
        state.favoritosApostilaIds.delete(id);
        showToast('Apostila removida dos favoritos.', 'info');
    } else {
        await fetch('/api/favoritos/apostilas', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(item),
        });
        state.favoritosApostilaIds.add(id);
        showToast('Apostila favoritada!', 'success');
    }

    loadFavoritosIds();
    document.querySelectorAll(`.apostila-card[data-id="${id}"] .btn-icon`).forEach(btn => {
        btn.classList.toggle('active', state.favoritosApostilaIds.has(id));
    });

    if (state.activeTab === 'favoritos') {
        loadFavoritosApostilas();
    }
}

async function loadFavoritosConcursos(status = null) {
    const container = document.getElementById('cards-favoritos-concursos');
    if (!container) return;

    renderSkeletons(container, 3);
    const url = status && status !== 'todos' ? `/api/favoritos/concursos?status=${encodeURIComponent(status)}` : '/api/favoritos/concursos';

    try {
        const res = await fetch(url);
        const items = await res.json();

        if (items.length === 0) {
            container.innerHTML = `
                <div class="empty-state">
                    <p>Nenhum concurso salvo ${status && status !== 'todos' ? `com status "${status}"` : ''}.</p>
                </div>
            `;
            return;
        }

        // Mapeia para formato esperado pelo render
        const formatted = items.map(f => ({
            id: f.noticia_id,
            uf: f.uf,
            formacao: f.formacao,
            vagas_salario: f.vagas_salario,
            cargos: f.cargos,
            status: f.status,
            notas: f.notas,
            noticia: {
                id: f.noticia_id,
                titulo: f.titulo,
                link: f.link_noticia,
                imagem: f.imagem_noticia,
            },
            datas: {
                inicio: f.data_inicio,
                fim: f.data_fim,
                dias_restantes: f.dias_restantes,
            },
            _is_favorito: true,
        }));

        renderConcursosCards(container, formatted);
    } catch (err) {
        container.innerHTML = `<div class="empty-state"><p>Erro ao carregar favoritos.</p></div>`;
    }
}

async function loadFavoritosApostilas() {
    const container = document.getElementById('cards-favoritos-apostilas');
    if (!container) return;

    renderSkeletons(container, 2);
    try {
        const res = await fetch('/api/favoritos/apostilas');
        const items = await res.json();

        if (items.length === 0) {
            container.innerHTML = `<div class="empty-state"><p>Nenhuma apostila favoritada ainda.</p></div>`;
            return;
        }

        const formatted = items.map(a => ({
            id: a.apostila_id,
            colecao_id: a.colecao_id,
            colecao_titulo: a.colecao_titulo,
            descricao: a.descricao,
            paginas: a.paginas,
            preco: a.preco,
            preco_formatado: a.preco_formatado,
            parcelado_6x: a.parcelado_6x,
            imagem: a.imagem,
            link_compra: a.link_compra,
            _is_favorito: true,
        }));

        renderApostilasCards(container, formatted);
    } catch (err) {
        container.innerHTML = `<div class="empty-state"><p>Erro ao carregar apostilas.</p></div>`;
    }
}

// ==========================================================================
// RADARES & HISTÓRICO
// ==========================================================================

function abrirModalSalvarRadar(tipo) {
    const modal = document.getElementById('modal-radar');
    const preview = document.getElementById('radar-preview-params');
    const inputNome = document.getElementById('input-radar-nome');

    let params = {};
    let nomeSugerido = '';

    if (tipo === 'explorar') {
        const termo = document.getElementById('input-termo-geral').value.trim();
        const uf = document.getElementById('select-uf-geral').value;
        const activeChip = document.querySelector('#region-chips .chip.active');
        const regiao = activeChip ? activeChip.dataset.regiao : 'todas';
        const professores = document.getElementById('check-professores').checked;

        params = { termo, uf, regiao, professores };
        nomeSugerido = termo ? `Radar: ${termo}` : `Radar ${regiao.toUpperCase()}${uf ? ' / ' + uf.toUpperCase() : ''}`;
    }

    state.pendingRadar = { tipo_busca: tipo, parametros: params };
    inputNome.value = nomeSugerido;
    preview.textContent = JSON.stringify(params, null, 2);
    modal.showModal();
}

async function confirmarSalvarRadar() {
    const nome = document.getElementById('input-radar-nome').value.trim();
    if (!nome) {
        showToast('Informe um nome para o radar.', 'error');
        return;
    }

    try {
        const res = await fetch('/api/radares', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                nome,
                tipo_busca: state.pendingRadar.tipo_busca,
                parametros: state.pendingRadar.parametros,
            }),
        });

        if (res.ok) {
            showToast('Radar salvo com sucesso!', 'success');
            document.getElementById('modal-radar').close();
            loadRadares();
        }
    } catch (err) {
        showToast('Erro ao salvar radar.', 'error');
    }
}

async function loadRadares() {
    const container = document.getElementById('lista-radares');
    if (!container) return;

    try {
        const res = await fetch('/api/radares');
        const radares = await res.json();

        if (radares.length === 0) {
            container.innerHTML = '<p class="text-muted text-xs">Nenhum radar salvo. Use o botão "Salvar Radar" na busca geral.</p>';
            return;
        }

        container.innerHTML = radares.map(r => `
            <div class="radar-item">
                <div>
                    <h5 class="radar-title">${escapeHtml(r.nome)}</h5>
                    <span class="radar-meta">Salvo em ${r.criado_em.split(' ')[0]}</span>
                </div>
                <div class="radar-actions">
                    <button class="btn-sm btn-primary" onclick="executarRadar(${r.id}, '${encodeURIComponent(JSON.stringify(r.parametros))}')">Executar</button>
                    <button class="btn-sm btn-danger-outline" onclick="removerRadar(${r.id})">Excluir</button>
                </div>
            </div>
        `).join('');
    } catch (err) {
        console.error('Erro ao carregar radares:', err);
    }
}

async function removerRadar(id) {
    if (confirm('Deseja excluir este radar?')) {
        await fetch(`/api/radares/${id}`, { method: 'DELETE' });
        showToast('Radar excluído.', 'info');
        loadRadares();
    }
}

function executarRadar(id, paramsStr) {
    const p = JSON.parse(decodeURIComponent(paramsStr));
    switchTab('explorar');

    if (p.termo) document.getElementById('input-termo-geral').value = p.termo;
    if (p.uf) document.getElementById('select-uf-geral').value = p.uf;
    if (p.professores !== undefined) document.getElementById('check-professores').checked = p.professores;

    if (p.regiao) {
        document.querySelectorAll('#region-chips .chip').forEach(c => {
            c.classList.toggle('active', c.dataset.regiao === p.regiao);
        });
    }

    executarBuscaGeral();
    showToast('Radar executado!', 'success');
}

async function loadHistorico() {
    const container = document.getElementById('lista-historico');
    if (!container) return;

    try {
        const res = await fetch('/api/historico?limit=25');
        const items = await res.json();

        if (items.length === 0) {
            container.innerHTML = '<p class="text-muted text-xs">Nenhuma busca recente.</p>';
            return;
        }

        container.innerHTML = items.map(h => `
            <div class="history-item">
                <div>
                    <h5 class="history-title">${escapeHtml(h.termo || h.tipo_busca)}</h5>
                    <span class="history-meta">${escapeHtml(h.tipo_busca.toUpperCase())} • ${h.total_resultados} resultados • ${h.criado_em.split(' ')[1]}</span>
                </div>
            </div>
        `).join('');
    } catch (err) {
        console.error('Erro ao carregar histórico:', err);
    }
}

// ==========================================================================
// TOAST NOTIFICATIONS
// ==========================================================================
function showToast(message, type = 'info') {
    const container = document.getElementById('toast-container');
    if (!container) return;

    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.innerHTML = `
        <span>${escapeHtml(message)}</span>
    `;

    container.appendChild(toast);
    setTimeout(() => {
        toast.style.opacity = '0';
        toast.style.transform = 'translateY(10px)';
        setTimeout(() => toast.remove(), 300);
    }, 3200);
}

// ==========================================================================
// HELPERS
// ==========================================================================
function escapeHtml(str) {
    if (typeof str !== 'string') return str;
    return str
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}
