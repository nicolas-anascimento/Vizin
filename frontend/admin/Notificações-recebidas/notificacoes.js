const escAdmin = valor => String(valor ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"})[c]);

// Categorias, ícones, rotas, normalização e o HTML do card vêm de notificacoes-shared.js.

const POR_PAGINA = 15;

// Intervalo do "tempo real" (polling leve só do resumo; a lista só é
// recarregada quando o admin pede ou quando chega notificação nova).
const INTERVALO_POLLING_MS = 60000;

let estado = {
    categoria: "todas",
    lida: "todas",
    busca: "",
    pagina: 1,
    notificacoes: [],
    total: 0,
    naoLidasConhecidas: null
};

// Permite abrir a tela já filtrada via URL (ex: ?lida=nao-lidas&categoria=pagamentos),
// usado pelos atalhos da tela Início. Valores inválidos são ignorados.
const _paramsUrl = new URLSearchParams(window.location.search);
if (CATEGORIAS[_paramsUrl.get("categoria")]) estado.categoria = _paramsUrl.get("categoria");
if (["nao-lidas", "lidas"].includes(_paramsUrl.get("lida"))) estado.lida = _paramsUrl.get("lida");

const listaEl = document.getElementById("listaNotificacoes");
const infoPaginacao = document.getElementById("infoPaginacao");
const paginacaoEl = document.getElementById("paginacao");
const estadoVazioEl = document.getElementById("notifEstadoVazio");
const inputBusca = document.getElementById("buscaNotificacoes");
const btnMarcarTodas = document.getElementById("btnMarcarTodasLidas");
const bannerNovas = document.getElementById("bannerNovasNotificacoes");
const avisoConexaoEl = document.getElementById("avisoConexao");
const avisoConexaoTexto = document.getElementById("avisoConexaoTexto");
const linkEntrar = document.getElementById("avisoConexaoEntrar");

function toastAdmin(mensagem, tipo) {
    if (typeof window.mostrarToastAdmin === "function") window.mostrarToastAdmin(mensagem, tipo);
}

// =====================================================
// AVISO DE CONEXÃO / SESSÃO (o polling falha em silêncio sem isto,
// e o admin acharia que está tudo em dia)
// =====================================================
function definirAvisoConexao(erro) {
    if (!erro) {
        avisoConexaoEl.hidden = true;
        return;
    }
    const sessaoExpirada = erro.status === 401;
    if (sessaoExpirada) {
        avisoConexaoTexto.textContent = "Sua sessão expirou. Entre novamente para continuar recebendo notificações.";
    } else if (erro instanceof TypeError) {
        avisoConexaoTexto.textContent = "Sem conexão com o servidor. As notificações abaixo podem estar desatualizadas.";
    } else {
        avisoConexaoTexto.textContent = "Não foi possível atualizar as notificações. Elas podem estar desatualizadas.";
    }
    linkEntrar.hidden = !sessaoExpirada;
    avisoConexaoEl.hidden = false;
}

document.getElementById("btnTentarConexao").addEventListener("click", () => {
    carregarResumo();
    carregarNotificacoes();
});

// =====================================================
// RESUMO (contadores dos filtros + badge)
// =====================================================
async function carregarResumo({ detectarNovas = false } = {}) {
    let resumo;
    try {
        resumo = await obterResumoNotificacoesAdmin();
    } catch (err) {
        definirAvisoConexao(err);
        return;
    }
    definirAvisoConexao(null);

    const naoLidas = Number(resumo.nao_lidas) || 0;

    document.getElementById("statNaoLidas").textContent = naoLidas;
    document.getElementById("statUrgentes").textContent = Number(resumo.urgentes_nao_lidas) || 0;
    document.getElementById("statHoje").textContent = Number(resumo.recebidas_hoje) || 0;
    btnMarcarTodas.disabled = naoLidas === 0;

    const porCat = resumo.por_categoria || {};
    Object.keys(CATEGORIAS).forEach(cat => {
        const el = document.getElementById(`contagem-${cat}`);
        if (el) {
            const n = Number(porCat[cat]) || 0;
            el.textContent = n;
            el.hidden = n === 0;
        }
    });

    // Avisa o menu lateral (admin-frame.js escuta este evento e atualiza
    // os contadores de cada link sem refazer a requisição).
    document.dispatchEvent(new CustomEvent("admin:notificacoes-nao-lidas", { detail: { total: naoLidas, resumo } }));
    if (typeof window.atualizarBadgeNotificacoesAdmin === "function") {
        window.atualizarBadgeNotificacoesAdmin(naoLidas);
    }

    // Chegou notificação nova desde a última checagem: mostra banner em vez
    // de reordenar a lista debaixo do mouse do admin.
    if (detectarNovas && estado.naoLidasConhecidas !== null && naoLidas > estado.naoLidasConhecidas) {
        const novas = naoLidas - estado.naoLidasConhecidas;
        bannerNovas.textContent = `${novas} nova${novas > 1 ? "s" : ""} notificaç${novas > 1 ? "ões" : "ão"} — clique para atualizar`;
        bannerNovas.hidden = false;
    }
    estado.naoLidasConhecidas = naoLidas;
}

// =====================================================
// LISTA (paginada no servidor)
// =====================================================
let tokenRequisicao = 0;

async function carregarNotificacoes() {
    const meuToken = ++tokenRequisicao;

    listaEl.innerHTML = `<p class="admin-tabela-vazio">Carregando...</p>`;
    estadoVazioEl.hidden = true;
    bannerNovas.hidden = true;

    let resposta;
    try {
        resposta = await listarNotificacoesAdmin({
            categoria: estado.categoria,
            lida: estado.lida,
            busca: estado.busca,
            pagina: estado.pagina,
            porPagina: POR_PAGINA
        });
    } catch (err) {
        if (meuToken !== tokenRequisicao) return;
        listaEl.innerHTML = `<p class="admin-tabela-vazio">${escAdmin(err.message)}</p>`;
        infoPaginacao.textContent = "";
        paginacaoEl.innerHTML = "";
        definirAvisoConexao(err);
        return;
    }
    if (meuToken !== tokenRequisicao) return;

    estado.notificacoes = (resposta.data || []).map(normalizarNotificacao);
    estado.total = Number(resposta.total) || 0;

    const totalPaginasAtual = Math.max(1, Math.ceil(estado.total / POR_PAGINA));
    if (estado.pagina > totalPaginasAtual) {
        estado.pagina = totalPaginasAtual;
        return carregarNotificacoes();
    }

    renderizarLista();
    renderizarPaginacao();
}

function filtrosAtivos() {
    return estado.categoria !== "todas" || estado.lida !== "todas" || !!estado.busca;
}

// Duas mensagens diferentes: "tudo em dia" (nada a mostrar) x "nada com esses
// filtros" (com atalho pra limpar) — pra não parecer que a tela quebrou.
function renderizarVazio() {
    estadoVazioEl.innerHTML = filtrosAtivos()
        ? `Nenhuma notificação com esses filtros. <button type="button" class="admin-link-limpar" id="btnLimparFiltros">Limpar filtros</button>`
        : `Tudo em dia! Nenhuma notificação por enquanto.`;
}

function renderizarLista() {
    const vazio = estado.notificacoes.length === 0;
    estadoVazioEl.hidden = !vazio;
    if (vazio) renderizarVazio();

    listaEl.innerHTML = estado.notificacoes.map(n => htmlNotificacao(n)).join("");
}

function renderizarPaginacao() {
    const totalPaginas = Math.max(1, Math.ceil(estado.total / POR_PAGINA));
    const inicio = estado.total === 0 ? 0 : (estado.pagina - 1) * POR_PAGINA + 1;
    const fim = Math.min(estado.pagina * POR_PAGINA, estado.total);

    infoPaginacao.textContent = `Mostrando ${inicio}–${fim} de ${estado.total} notificaç${estado.total === 1 ? "ão" : "ões"}`;

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
        carregarNotificacoes();
    }, 350);
});

// =====================================================
// FILTROS (Categoria / Leitura) — mesmo padrão de denuncias.js
// =====================================================
const btnFiltros = document.getElementById("btnFiltros");
const filtroStatusBar = document.getElementById("filtroStatusBar");

btnFiltros.addEventListener("click", () => filtroStatusBar.classList.toggle("aberta"));
document.addEventListener("click", (e) => {
    if (!e.target.closest(".admin-filtros-container")) filtroStatusBar.classList.remove("aberta");
});

function atualizarBotaoFiltrosAtivo() {
    btnFiltros.classList.toggle("active", estado.categoria !== "todas" || estado.lida !== "todas");
}

// Reflete o estado (vindo da URL, de um clique ou de "Limpar filtros") nos pills.
function sincronizarFiltrosUi() {
    document.querySelectorAll(".admin-filtro-pill").forEach(p => {
        const valorAtual = p.dataset.grupo === "categoria" ? estado.categoria : estado.lida;
        p.classList.toggle("active", p.dataset.valor === valorAtual);
    });
    atualizarBotaoFiltrosAtivo();
}

function ligarGrupoFiltro(grupo, chaveEstado) {
    document.querySelectorAll(`.admin-filtro-pill[data-grupo='${grupo}']`).forEach(pill => {
        pill.addEventListener("click", () => {
            estado[chaveEstado] = pill.dataset.valor;
            estado.pagina = 1;
            sincronizarFiltrosUi();
            carregarNotificacoes();
        });
    });
}
ligarGrupoFiltro("categoria", "categoria");
ligarGrupoFiltro("lida", "lida");
sincronizarFiltrosUi();

function limparFiltros() {
    estado.categoria = "todas";
    estado.lida = "todas";
    estado.busca = "";
    estado.pagina = 1;
    inputBusca.value = "";
    sincronizarFiltrosUi();
    carregarNotificacoes();
}
estadoVazioEl.addEventListener("click", (e) => {
    if (e.target.closest("#btnLimparFiltros")) limparFiltros();
});

// Card "Não lidas" funciona como atalho pro filtro de não lidas.
const cardNaoLidas = document.getElementById("statNaoLidas")?.closest(".admin-stat-card");
if (cardNaoLidas) {
    cardNaoLidas.classList.add("admin-stat-card-clicavel");
    cardNaoLidas.setAttribute("role", "button");
    cardNaoLidas.setAttribute("tabindex", "0");
    const ativar = () => {
        estado.lida = "nao-lidas";
        estado.pagina = 1;
        sincronizarFiltrosUi();
        carregarNotificacoes();
    };
    cardNaoLidas.addEventListener("click", ativar);
    cardNaoLidas.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); ativar(); } });
}

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

    carregarNotificacoes();
    window.scrollTo({ top: 0, behavior: "smooth" });
});

// =====================================================
// AÇÕES
// =====================================================
async function alternarLeitura(notificacao) {
    const novaLida = !notificacao.lida;
    try {
        await alterarLeituraNotificacaoAdmin(notificacao.id, novaLida);
    } catch (err) {
        toastAdmin(err.message, "erro");
        return;
    }
    // Se o filtro de leitura esconderia o item agora, recarrega; senão só atualiza no lugar.
    const some = (estado.lida === "nao-lidas" && novaLida) || (estado.lida === "lidas" && !novaLida);
    if (some) {
        carregarNotificacoes();
    } else {
        notificacao.lida = novaLida;
        renderizarLista();
    }
    carregarResumo();
}

// Dispensar esconde a notificação SÓ pra quem clicou (os outros admins continuam
// vendo), por isso não precisa de confirmação.
async function dispensarNotificacao(notificacao) {
    try {
        await dispensarNotificacaoAdmin(notificacao.id);
    } catch (err) {
        toastAdmin(err.message, "erro");
        return;
    }
    toastAdmin("Notificação dispensada", "sucesso");
    carregarNotificacoes();
    carregarResumo();
}

listaEl.addEventListener("click", (e) => {
    const alvo = e.target.closest("[data-acao]");
    if (!alvo) return;

    const cartao = alvo.closest(".admin-notif");
    const notificacao = estado.notificacoes.find(n => n.id === cartao?.dataset.id);
    if (!notificacao) return;

    const acao = alvo.dataset.acao;

    if (acao === "alternar-leitura") alternarLeitura(notificacao);
    if (acao === "dispensar") dispensarNotificacao(notificacao);

    // Abrir o detalhe marca como lida (sem bloquear a navegação).
    if (acao === "abrir" && !notificacao.lida) {
        alterarLeituraNotificacaoAdmin(notificacao.id, true).catch(() => {});
    }
});

btnMarcarTodas.addEventListener("click", async () => {
    btnMarcarTodas.disabled = true;
    try {
        await marcarTodasNotificacoesAdminLidas(estado.categoria);
    } catch (err) {
        toastAdmin(err.message, "erro");
        btnMarcarTodas.disabled = false;
        return;
    }
    toastAdmin(estado.categoria === "todas" ? "Todas marcadas como lidas" : `Notificações de ${CATEGORIAS[estado.categoria].label} marcadas como lidas`, "sucesso");
    carregarNotificacoes();
    carregarResumo();
});

bannerNovas.addEventListener("click", () => {
    estado.pagina = 1;
    carregarNotificacoes();
    carregarResumo();
});

// =====================================================
// INÍCIO + "TEMPO REAL" (polling do resumo, pausado com a aba oculta)
// =====================================================
carregarResumo();
carregarNotificacoes();

setInterval(() => {
    if (document.hidden) return;
    carregarResumo({ detectarNovas: true });
}, INTERVALO_POLLING_MS);

document.addEventListener("visibilitychange", () => {
    if (!document.hidden) carregarResumo({ detectarNovas: true });
});