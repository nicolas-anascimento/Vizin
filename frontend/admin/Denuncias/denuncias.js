const escAdmin = valor => String(valor ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"})[c]);

const POR_PAGINA = 10;

// Prazo pra contar uma ocorrência como "sem resposta há muito tempo" no
// indicador da tabela e no banner do topo — mesmo limiar usado no cálculo
// de criticas_sem_resposta_24h do endpoint de resumo (ver denuncias-api.js).
const HORAS_LIMITE_SEM_RESPOSTA = 24;

let estado = {
    busca: "",
    tipo: "todos",
    status: "todos",
    prioridade: "todos",
    pagina: 1,
    ocorrencias: [],
    total: 0
};

const corpoTabela = document.getElementById("corpoTabelaOcorrencias");
const infoPaginacao = document.getElementById("infoPaginacao");
const paginacaoEl = document.getElementById("paginacao");
const tabelaEstadoVazio = document.getElementById("tabelaEstadoVazio");
const inputBusca = document.getElementById("buscaOcorrencias");
const bannerCriticas = document.getElementById("bannerCriticasSemResposta");

// =====================================================
// RÓTULOS / ÍCONES
// =====================================================
function labelStatus(status) {
    return { aberta: "Aberta", andamento: "Em Progresso", resolvida: "Resolvida", fechada: "Fechada", improcedente: "Improcedente" }[status] || status;
}
function labelPrioridade(prioridade) {
    return { critica: "Crítica", alta: "Alta", media: "Média", baixa: "Baixa" }[prioridade] || prioridade;
}
function labelTipo(tipo) {
    return { denuncia: "Denúncia", suporte: "Suporte" }[tipo] || tipo;
}
function labelOrigem(origem) {
    if (!origem) return null;
    return { anuncio: "Anúncio", avaliacao: "Avaliação", aluguel: "Aluguel", conversa: "Conversa" }[origem.tipo] || origem.tipo;
}
function iconeOrigem(origem) {
    if (!origem) return "bi-dot";
    return { anuncio: "bi-megaphone", avaliacao: "bi-star", aluguel: "bi-box-seam", conversa: "bi-chat-left-text" }[origem.tipo] || "bi-dot";
}

function formatarData(iso) {
    if (!iso) return "—";
    const data = new Date(iso);
    return Number.isNaN(data.getTime()) ? "—" : data.toLocaleDateString("pt-BR");
}

// "aberta há 3 dias" — só faz sentido pra quem ainda está pendente
// (aberta/andamento); resolvida/fechada/improcedente mostram só a data.
function tempoAbertaLabel(ocorrencia) {
    if (!["aberta", "andamento"].includes(ocorrencia.status)) return null;
    const criado = new Date(ocorrencia.criadoEm);
    if (Number.isNaN(criado.getTime())) return null;
    const horas = (Date.now() - criado.getTime()) / 36e5;
    const dias = Math.floor(horas / 24);
    const texto = dias >= 1 ? `há ${dias} dia${dias > 1 ? "s" : ""}` : "há poucas horas";
    return { texto, urgente: horas >= HORAS_LIMITE_SEM_RESPOSTA };
}

// =====================================================
// CARDS DE RESUMO (base inteira, não a página/filtro atual — ver
// obterResumoOcorrenciasAdmin em denuncias-api.js, mesmo espírito de
// obterEstatisticasPagamentosAdmin em pagamentos.js)
// =====================================================
async function carregarResumo() {
    let resumo;
    try {
        resumo = await obterResumoOcorrenciasAdmin();
    } catch (err) {
        ["statAbertas", "statResolvidas", "statTickets"].forEach(id => {
            const el = document.getElementById(id);
            el.textContent = "Erro";
            el.title = err.message;
            el.classList.add("erro");
        });
        return;
    }

    document.getElementById("statAbertas").textContent = resumo.denuncias_abertas ?? 0;
    document.getElementById("statResolvidas").textContent = resumo.casos_resolvidos ?? 0;
    document.getElementById("statTickets").textContent = resumo.tickets_suporte ?? 0;

    const pendentesBadge = document.getElementById("pendentesBadge");
    const totalPendentes = Number(resumo.total_pendentes) || 0;
    if (totalPendentes > 0) {
        pendentesBadge.textContent = `${totalPendentes} caso${totalPendentes > 1 ? "s" : ""} pendente${totalPendentes > 1 ? "s" : ""}`;
        pendentesBadge.hidden = false;
    } else {
        pendentesBadge.hidden = true;
    }

    const criticas = Number(resumo.criticas_sem_resposta_24h) || 0;
    if (criticas > 0) {
        bannerCriticas.textContent = `⚠ ${criticas} denúncia${criticas > 1 ? "s" : ""} crítica${criticas > 1 ? "s" : ""} sem resposta há mais de ${HORAS_LIMITE_SEM_RESPOSTA}h.`;
        bannerCriticas.hidden = false;
    } else {
        bannerCriticas.hidden = true;
    }
}

// =====================================================
// TABELA (paginada no servidor — mesmo padrão de listarTransacoesAdmin)
// =====================================================
// Token da requisição em andamento, mesma técnica de pagamentos.js: evita
// que uma resposta lenta e antiga sobrescreva a tabela depois que o admin
// já mudou de página/filtro/busca.
let tokenRequisicaoOcorrencias = 0;

async function carregarOcorrencias() {
    const meuToken = ++tokenRequisicaoOcorrencias;

    corpoTabela.innerHTML = `<tr><td colspan="8" class="admin-tabela-vazio">Carregando...</td></tr>`;
    tabelaEstadoVazio.hidden = true;

    let resposta;
    try {
        resposta = await listarOcorrenciasAdmin({
            busca: estado.busca,
            tipo: estado.tipo,
            status: estado.status,
            prioridade: estado.prioridade,
            pagina: estado.pagina,
            porPagina: POR_PAGINA
        });
    } catch (err) {
        if (meuToken !== tokenRequisicaoOcorrencias) return;
        corpoTabela.innerHTML = `<tr><td colspan="8" class="admin-tabela-vazio">${escAdmin(err.message)}</td></tr>`;
        infoPaginacao.textContent = '';
        paginacaoEl.innerHTML = '';
        return;
    }

    if (meuToken !== tokenRequisicaoOcorrencias) return;

    estado.ocorrencias = (resposta.data || []).map(normalizarOcorrenciaAdmin);
    estado.total = Number(resposta.total) || 0;

    const totalPaginasAtual = Math.max(1, Math.ceil(estado.total / POR_PAGINA));
    if (estado.pagina > totalPaginasAtual) {
        estado.pagina = totalPaginasAtual;
        return carregarOcorrencias();
    }

    renderizarTabela();
    renderizarPaginacao();
}

function renderizarTabela() {
    tabelaEstadoVazio.hidden = estado.ocorrencias.length > 0;

    corpoTabela.innerHTML = estado.ocorrencias.map(o => {
        const denunciado = o.denunciadoNome ? escAdmin(o.denunciadoNome) : "—";
        const origemLabel = labelOrigem(o.origem);
        const origemTag = origemLabel
            ? `<div class="admin-tag-origem"><i class="bi ${iconeOrigem(o.origem)}"></i> ${escAdmin(origemLabel)}</div>`
            : "";
        const tempo = tempoAbertaLabel(o);
        const tempoHtml = tempo
            ? `<div class="admin-tempo-aberta ${tempo.urgente ? "urgente" : ""}">${escAdmin(tempo.texto)}</div>`
            : "";

        return `
        <tr data-id="${escAdmin(o.id)}">
            <td data-label="ID" class="admin-ocorrencia-id">#${escAdmin(o.id)}</td>
            <td data-label="Denunciante">${escAdmin(o.denuncianteNome)}</td>
            <td data-label="Denunciado">${denunciado}</td>
            <td data-label="Motivo">
                <div class="admin-motivo-titulo">${escAdmin(o.motivo)}</div>
                ${origemTag}
            </td>
            <td data-label="Prioridade"><span class="admin-badge prioridade-${o.prioridade}">${labelPrioridade(o.prioridade)}</span></td>
            <td data-label="Data">${formatarData(o.criadoEm)}${tempoHtml}</td>
            <td data-label="Status"><span class="admin-badge status-${o.status}">${labelStatus(o.status)}</span></td>
            <td data-label="Ações">
                <div class="admin-acoes">
                    <button class="admin-acao-btn ver" title="Ver detalhes / responder" data-acao="ver"><i class="bi bi-eye"></i></button>
                    <button class="admin-acao-btn status" title="Marcar como resolvida" data-acao="resolver" ${["resolvida", "fechada", "improcedente"].includes(o.status) ? "disabled" : ""}><i class="bi bi-check-circle"></i></button>
                    <button class="admin-acao-btn excluir" title="Marcar como improcedente" data-acao="improcedente" ${o.status === "improcedente" ? "disabled" : ""}><i class="bi bi-slash-circle"></i></button>
                </div>
            </td>
        </tr>`;
    }).join("");
}

function renderizarPaginacao() {
    const totalPaginas = Math.max(1, Math.ceil(estado.total / POR_PAGINA));
    const inicio = estado.total === 0 ? 0 : (estado.pagina - 1) * POR_PAGINA + 1;
    const fim = Math.min(estado.pagina * POR_PAGINA, estado.total);

    infoPaginacao.textContent = `Mostrando ${inicio}–${fim} de ${estado.total} ocorrência${estado.total === 1 ? "" : "s"}`;

    let botoes = `<button class="admin-pagina-btn" data-pagina="anterior" ${estado.pagina === 1 ? "disabled" : ""}>Anterior</button>`;
    for (let p = 1; p <= totalPaginas; p++) {
        botoes += `<button class="admin-pagina-btn ${p === estado.pagina ? "active" : ""}" data-pagina="${p}">${p}</button>`;
    }
    botoes += `<button class="admin-pagina-btn" data-pagina="proximo" ${estado.pagina === totalPaginas ? "disabled" : ""}>Próximo</button>`;

    paginacaoEl.innerHTML = botoes;
}

// =====================================================
// BUSCA (com debounce)
// =====================================================
let debounceId = null;
inputBusca.addEventListener("input", () => {
    clearTimeout(debounceId);
    debounceId = setTimeout(() => {
        estado.busca = inputBusca.value.trim();
        estado.pagina = 1;
        carregarOcorrencias();
    }, 350);
});

// =====================================================
// FILTROS (Tipo / Status / Prioridade — 3 grupos de pills dentro do
// mesmo painel; comportamento de abrir/fechar idêntico ao de usuarios.js)
// =====================================================
const btnFiltros = document.getElementById("btnFiltros");
const filtroStatusBar = document.getElementById("filtroStatusBar");

btnFiltros.addEventListener("click", () => {
    filtroStatusBar.classList.toggle("aberta");
});

document.addEventListener("click", (e) => {
    if (!e.target.closest(".admin-filtros-container")) {
        filtroStatusBar.classList.remove("aberta");
    }
});

function ligarGrupoFiltro(seletor, chaveEstado) {
    document.querySelectorAll(seletor).forEach(pill => {
        pill.addEventListener("click", () => {
            document.querySelectorAll(seletor).forEach(p => p.classList.remove("active"));
            pill.classList.add("active");
            estado[chaveEstado] = pill.dataset.valor;
            estado.pagina = 1;
            atualizarBotaoFiltrosAtivo();
            carregarOcorrencias();
        });
    });
}
ligarGrupoFiltro(".admin-filtro-pill[data-grupo='tipo']", "tipo");
ligarGrupoFiltro(".admin-filtro-pill[data-grupo='status']", "status");
ligarGrupoFiltro(".admin-filtro-pill[data-grupo='prioridade']", "prioridade");

function atualizarBotaoFiltrosAtivo() {
    const algumFiltroAtivo = estado.tipo !== "todos" || estado.status !== "todos" || estado.prioridade !== "todos";
    btnFiltros.classList.toggle("active", algumFiltroAtivo);
}

// =====================================================
// CARDS DO TOPO COMO ATALHO DE FILTRO (mesmo padrão de pagamentos.js)
// =====================================================
function tornarCardClicavel(elId, chaveEstado, valor) {
    const el = document.getElementById(elId);
    const card = el?.closest(".admin-stat-card");
    if (!card) return;
    card.classList.add("admin-stat-card-clicavel");
    card.setAttribute("role", "button");
    card.setAttribute("tabindex", "0");
    const ativar = () => {
        estado[chaveEstado] = valor;
        estado.pagina = 1;
        document.querySelectorAll(`.admin-filtro-pill[data-grupo='${chaveEstado === "tipo" ? "tipo" : "status"}']`)
            .forEach(p => p.classList.toggle("active", p.dataset.valor === valor));
        atualizarBotaoFiltrosAtivo();
        carregarOcorrencias();
    };
    card.addEventListener("click", ativar);
    card.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); ativar(); } });
}
// "Denúncias Abertas" filtra por status aberta; "Tickets de Suporte" filtra por tipo suporte.
tornarCardClicavel("statAbertas", "status", "aberta");
tornarCardClicavel("statTickets", "tipo", "suporte");

// =====================================================
// PAGINAÇÃO
// =====================================================
paginacaoEl.addEventListener("click", (e) => {
    const btn = e.target.closest(".admin-pagina-btn");
    if (!btn || btn.disabled) return;

    const alvo = btn.dataset.pagina;
    const totalPaginas = Math.max(1, Math.ceil(estado.total / POR_PAGINA));

    if (alvo === "anterior") estado.pagina = Math.max(1, estado.pagina - 1);
    else if (alvo === "proximo") estado.pagina = Math.min(totalPaginas, estado.pagina + 1);
    else estado.pagina = Number(alvo);

    carregarOcorrencias();
});

// =====================================================
// AÇÕES DA LINHA (ver/responder / resolver / improcedente)
// Ver admin-denuncia-acoes.js para os modais.
// =====================================================
corpoTabela.addEventListener("click", (e) => {
    const btn = e.target.closest(".admin-acao-btn");
    if (!btn) return;

    const linha = btn.closest("tr");
    const id = linha.dataset.id;
    const ocorrencia = estado.ocorrencias.find(o => o.id === id);
    if (!ocorrencia) return;

    const acao = btn.dataset.acao;

    if (acao === "ver") {
        abrirModalOcorrencia(ocorrencia, () => carregarOcorrencias());
    }
    if (acao === "resolver") {
        confirmarMudancaStatusRapida(ocorrencia, "resolvida", () => carregarOcorrencias());
    }
    if (acao === "improcedente") {
        abrirModalImprocedente(ocorrencia, () => { carregarOcorrencias(); carregarResumo(); });
    }
});

// =====================================================
// INÍCIO
// =====================================================
carregarResumo();
carregarOcorrencias();

// =====================================================
// ABRIR DIRETO UMA OCORRÊNCIA (?abrir=<id>) — usado pela central de
// notificações. Tira o parâmetro da URL pra um F5 não reabrir o modal.
// =====================================================
(async function abrirItemDaUrl() {
    const params = new URLSearchParams(window.location.search);
    const id = params.get("abrir");
    if (!id) return;
    params.delete("abrir");
    const resto = params.toString();
    history.replaceState(null, "", window.location.pathname + (resto ? `?${resto}` : ""));

    let ocorrencia;
    try {
        ocorrencia = normalizarOcorrenciaAdmin(await obterOcorrenciaAdmin(id));
    } catch (err) {
        window.mostrarToastAdmin(
            err.status === 404 ? "Esta ocorrência não existe mais ou foi removida." : err.message,
            "erro"
        );
        return;
    }

    // Outro admin pode ter encerrado antes: avisa, mas deixa abrir pra consulta.
    if (["resolvida", "fechada", "improcedente"].includes(ocorrencia.status)) {
        window.mostrarToastAdmin(`Esta ocorrência já foi encerrada (${labelStatus(ocorrencia.status)}).`, "info");
    }
    abrirModalOcorrencia(ocorrencia, () => { carregarOcorrencias(); carregarResumo(); });
})();