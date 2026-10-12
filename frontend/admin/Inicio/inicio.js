const escAdmin = valor => String(valor ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"})[c]);

// Tela inicial do admin: resume as filas e mostra o que é urgente.
// Só lê rotas que já existem (resumo de ocorrências, estatísticas de
// pagamentos, lista de verificações) + as de notificações.

const numero = v => {
    const n = Number(v);
    return Number.isFinite(n) && n > 0 ? Math.floor(n) : 0;
};

function marcarCardComErro(id, mensagem) {
    const el = document.getElementById(id);
    el.textContent = "Erro";
    el.title = mensagem;
    el.classList.add("erro");
}

// =====================================================
// CARDS
// =====================================================
async function carregarCards() {
    const [ocor, verif, pag, notif] = await Promise.allSettled([
        apiRequest("/admin/ocorrencias/resumo", "GET", null, "Não foi possível carregar o resumo de ocorrências."),
        apiRequest("/admin/verificacoes?status=pendente&page=1&limit=1", "GET", null, "Não foi possível carregar as verificações."),
        apiRequest("/admin/pagamentos/estatisticas", "GET", null, "Não foi possível carregar as estatísticas de pagamentos."),
        obterResumoNotificacoesAdmin()
    ]);

    if (ocor.status === "fulfilled") {
        document.getElementById("cardDenuncias").textContent = numero(ocor.value.total_pendentes);
        const criticas = numero(ocor.value.criticas_sem_resposta_24h);
        if (criticas > 0) {
            const sub = document.getElementById("cardDenunciasSub");
            sub.textContent = `${criticas} crítica${criticas > 1 ? "s" : ""} sem resposta há +24h`;
            sub.classList.add("inicio-sub-alerta");
        }
    } else marcarCardComErro("cardDenuncias", ocor.reason?.message || "Erro");

    if (verif.status === "fulfilled") {
        document.getElementById("cardVerificacoes").textContent = numero(verif.value.total);
    } else marcarCardComErro("cardVerificacoes", verif.reason?.message || "Erro");

    if (pag.status === "fulfilled") {
        document.getElementById("cardPagamentos").textContent = numero(pag.value.transacoes_falhadas);
    } else marcarCardComErro("cardPagamentos", pag.reason?.message || "Erro");

    if (notif.status === "fulfilled") {
        document.getElementById("cardNotificacoes").textContent = numero(notif.value.nao_lidas);
        const urgentes = numero(notif.value.urgentes_nao_lidas);
        if (urgentes > 0) {
            const sub = document.getElementById("cardNotificacoesSub");
            sub.textContent = `${urgentes} urgente${urgentes > 1 ? "s" : ""}`;
            sub.classList.add("inicio-sub-alerta");
        }
    } else marcarCardComErro("cardNotificacoes", notif.reason?.message || "Erro");
}

// =====================================================
// PRECISA DE ATENÇÃO (últimas urgentes não lidas)
// =====================================================
let itensAtencao = [];

async function carregarAtencao() {
    const listaEl = document.getElementById("listaAtencao");
    const vazioEl = document.getElementById("atencaoVazio");

    try {
        const resposta = await listarNotificacoesAdmin({ lida: "nao-lidas", prioridade: "alta", pagina: 1, porPagina: 6 });
        itensAtencao = (resposta.data || []).map(normalizarNotificacao);
    } catch (err) {
        listaEl.innerHTML = `<p class="admin-tabela-vazio">${escAdmin(err.message)}</p>`;
        vazioEl.hidden = true;
        return;
    }

    vazioEl.hidden = itensAtencao.length > 0;
    listaEl.innerHTML = itensAtencao.map(n => htmlNotificacao(n, { acoes: false })).join("");
}

// Abrir o detalhe marca como lida (sem bloquear a navegação).
document.getElementById("listaAtencao").addEventListener("click", (e) => {
    const alvo = e.target.closest("[data-acao='abrir']");
    if (!alvo) return;
    const id = alvo.closest(".admin-notif")?.dataset.id;
    const n = itensAtencao.find(x => x.id === id);
    if (n && !n.lida) alterarLeituraNotificacaoAdmin(n.id, true).catch(() => {});
});

carregarCards();
carregarAtencao();

// Mantém a tela viva sem F5 (mesma cadência da sidebar).
setInterval(() => {
    if (document.hidden) return;
    carregarCards();
    carregarAtencao();
}, 60000);