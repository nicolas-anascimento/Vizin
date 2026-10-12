const escAdmin = valor => String(valor ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"})[c]);

const POR_PAGINA = 25;

const CATEGORIAS_AUDITORIA = {
    usuarios: "Usuários", anuncios: "Anúncios", avaliacoes: "Avaliações", denuncias: "Denúncias",
    verificacoes: "Verificações", categorias: "Categorias", notificacoes: "Notificações enviadas"
};

// Rótulo legível por código de ação; código desconhecido cai num texto gerado
// (usuario_suspenso -> "Usuario suspenso") pra não quebrar quando o back criar ações novas.
const ROTULOS_ACAO = {
    usuario_suspenso: "Suspendeu usuário",
    usuario_reativado: "Reativou usuário",
    usuario_excluido: "Excluiu usuário",
    anuncio_ocultado: "Ocultou anúncio",
    anuncio_reexibido: "Reexibiu anúncio",
    anuncio_arquivado: "Arquivou anúncio",
    avaliacao_ocultada: "Ocultou avaliação",
    avaliacao_reexibida: "Reexibiu avaliação",
    avaliacao_excluida: "Excluiu avaliação",
    ocorrencia_status_alterado: "Alterou status de ocorrência",
    ocorrencia_improcedente: "Marcou denúncia como improcedente",
    ocorrencia_respondida: "Respondeu ocorrência",
    verificacao_aprovada: "Aprovou verificação",
    verificacao_reprovada: "Reprovou verificação",
    verificacao_revogada: "Revogou verificação",
    notificacao_enviada: "Enviou notificação aos usuários",
    categoria_alterada: "Alterou categoria"
};

function rotuloAcao(codigo) {
    if (ROTULOS_ACAO[codigo]) return ROTULOS_ACAO[codigo];
    const texto = String(codigo || "Ação").replace(/_/g, " ");
    return texto.charAt(0).toUpperCase() + texto.slice(1);
}

// Para onde o alvo leva (excluídos não têm id: só o rótulo, sem link).
const ROTAS_ALVO = {
    usuario:     id => `/admin/usuarios/detalhe?id=${encodeURIComponent(id)}`,
    objeto:      id => `/admin/objetos?abrir=${encodeURIComponent(id)}`,
    avaliacao:   id => `/admin/avaliacoes?abrir=${encodeURIComponent(id)}`,
    ocorrencia:  id => `/admin/denuncias?abrir=${encodeURIComponent(id)}`,
    verificacao: id => `/admin/verificacoes/analise?id=${encodeURIComponent(id)}`
};

let estado = { busca: "", categoria: "todas", de: "", ate: "", pagina: 1, itens: [], total: 0 };

const corpoTabela = document.getElementById("corpoTabelaAuditoria");
const infoPaginacao = document.getElementById("infoPaginacao");
const paginacaoEl = document.getElementById("paginacao");
const tabelaEstadoVazio = document.getElementById("tabelaEstadoVazio");
const inputBusca = document.getElementById("buscaAuditoria");
const inputDe = document.getElementById("filtroDe");
const inputAte = document.getElementById("filtroAte");

function formatarDataHora(iso) {
    if (!iso) return "—";
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return "—";
    return `${d.toLocaleDateString("pt-BR")} ${d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}`;
}

function normalizar(r) {
    return {
        id: String(r.id),
        criadoEm: r.criado_em,
        acao: r.acao || "",
        categoria: CATEGORIAS_AUDITORIA[r.categoria] ? r.categoria : "usuarios",
        adminNome: r.admin?.nome || "Administrador",
        alvoTipo: r.alvo?.tipo || null,
        alvoId: r.alvo?.id != null ? String(r.alvo.id) : null,
        alvoRotulo: r.alvo?.rotulo || "",
        motivo: r.motivo || ""
    };
}

// =====================================================
// CARREGAR
// =====================================================
let tokenRequisicao = 0;

async function carregar() {
    const meuToken = ++tokenRequisicao;
    corpoTabela.innerHTML = `<tr><td colspan="5" class="admin-tabela-vazio">Carregando...</td></tr>`;
    tabelaEstadoVazio.hidden = true;

    let resposta;
    try {
        resposta = await listarAuditoriaAdmin({
            busca: estado.busca, categoria: estado.categoria, de: estado.de, ate: estado.ate,
            pagina: estado.pagina, porPagina: POR_PAGINA
        });
    } catch (err) {
        if (meuToken !== tokenRequisicao) return;
        corpoTabela.innerHTML = `<tr><td colspan="5" class="admin-tabela-vazio">${escAdmin(err.message)}</td></tr>`;
        infoPaginacao.textContent = "";
        paginacaoEl.innerHTML = "";
        return;
    }
    if (meuToken !== tokenRequisicao) return;

    estado.itens = (resposta.data || []).map(normalizar);
    estado.total = Number(resposta.total) || 0;

    const totalPaginas = Math.max(1, Math.ceil(estado.total / POR_PAGINA));
    if (estado.pagina > totalPaginas) {
        estado.pagina = totalPaginas;
        return carregar();
    }

    renderizarTabela();
    renderizarPaginacao();
}

function filtrosAtivos() {
    return estado.categoria !== "todas" || !!estado.busca || !!estado.de || !!estado.ate;
}

function renderizarTabela() {
    const vazio = estado.itens.length === 0;
    tabelaEstadoVazio.hidden = !vazio;
    if (vazio) {
        tabelaEstadoVazio.innerHTML = filtrosAtivos()
            ? `Nenhuma ação encontrada com esses filtros. <button type="button" class="audit-link-limpar" id="btnLimparFiltros">Limpar filtros</button>`
            : `Nenhuma ação registrada ainda.`;
    }

    corpoTabela.innerHTML = estado.itens.map(a => {
        const rota = a.alvoTipo && a.alvoId && ROTAS_ALVO[a.alvoTipo] ? ROTAS_ALVO[a.alvoTipo](a.alvoId) : null;
        const alvo = a.alvoRotulo
            ? (rota ? `<a class="audit-alvo-link" href="${rota}">${escAdmin(a.alvoRotulo)}</a>` : escAdmin(a.alvoRotulo))
            : "—";
        return `
        <tr data-id="${escAdmin(a.id)}">
            <td data-label="Data" class="audit-data">${escAdmin(formatarDataHora(a.criadoEm))}</td>
            <td data-label="Administrador" class="admin-nome">${escAdmin(a.adminNome)}</td>
            <td data-label="Ação"><span class="audit-acao cat-${a.categoria}">${escAdmin(rotuloAcao(a.acao))}</span></td>
            <td data-label="Alvo">${alvo}</td>
            <td data-label="Motivo" class="audit-motivo">${a.motivo ? escAdmin(a.motivo) : "—"}</td>
        </tr>`;
    }).join("");
}

function renderizarPaginacao() {
    const totalPaginas = Math.max(1, Math.ceil(estado.total / POR_PAGINA));
    const inicio = estado.total === 0 ? 0 : (estado.pagina - 1) * POR_PAGINA + 1;
    const fim = Math.min(estado.pagina * POR_PAGINA, estado.total);

    infoPaginacao.textContent = `Mostrando ${inicio}–${fim} de ${estado.total} ação${estado.total === 1 ? "" : "ões"}`;

    let botoes = `<button class="admin-pagina-btn" data-pagina="anterior" ${estado.pagina === 1 ? "disabled" : ""}>Anterior</button>`;
    for (let p = 1; p <= totalPaginas; p++) {
        botoes += `<button class="admin-pagina-btn ${p === estado.pagina ? "active" : ""}" data-pagina="${p}">${p}</button>`;
    }
    botoes += `<button class="admin-pagina-btn" data-pagina="proximo" ${estado.pagina === totalPaginas ? "disabled" : ""}>Próximo</button>`;
    paginacaoEl.innerHTML = botoes;
}

// =====================================================
// BUSCA (debounce)
// =====================================================
let debounceId = null;
inputBusca.addEventListener("input", () => {
    clearTimeout(debounceId);
    debounceId = setTimeout(() => {
        estado.busca = inputBusca.value.trim();
        estado.pagina = 1;
        carregar();
    }, 350);
});

// =====================================================
// FILTROS (categoria + período)
// =====================================================
const btnFiltros = document.getElementById("btnFiltros");
const filtroStatusBar = document.getElementById("filtroStatusBar");

btnFiltros.addEventListener("click", () => filtroStatusBar.classList.toggle("aberta"));
document.addEventListener("click", (e) => {
    if (!e.target.closest(".admin-filtros-container")) filtroStatusBar.classList.remove("aberta");
});

function sincronizarFiltrosUi() {
    document.querySelectorAll(".admin-filtro-pill").forEach(p => p.classList.toggle("active", p.dataset.valor === estado.categoria));
    inputDe.value = estado.de;
    inputAte.value = estado.ate;
    btnFiltros.classList.toggle("active", estado.categoria !== "todas" || !!estado.de || !!estado.ate);
}

document.querySelectorAll(".admin-filtro-pill").forEach(pill => {
    pill.addEventListener("click", () => {
        estado.categoria = pill.dataset.valor;
        estado.pagina = 1;
        sincronizarFiltrosUi();
        carregar();
    });
});

function aplicarPeriodo() {
    let de = inputDe.value;
    let ate = inputAte.value;
    if (de && ate && de > ate) [de, ate] = [ate, de]; // período invertido: troca
    estado.de = de;
    estado.ate = ate;
    estado.pagina = 1;
    sincronizarFiltrosUi();
    carregar();
}
inputDe.addEventListener("change", aplicarPeriodo);
inputAte.addEventListener("change", aplicarPeriodo);

function limparFiltros() {
    estado = { ...estado, busca: "", categoria: "todas", de: "", ate: "", pagina: 1 };
    inputBusca.value = "";
    sincronizarFiltrosUi();
    carregar();
}
document.getElementById("btnLimparPeriodo").addEventListener("click", () => {
    estado.de = ""; estado.ate = ""; estado.pagina = 1;
    sincronizarFiltrosUi();
    carregar();
});
tabelaEstadoVazio.addEventListener("click", (e) => {
    if (e.target.closest("#btnLimparFiltros")) limparFiltros();
});

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

    carregar();
});

sincronizarFiltrosUi();
carregar();