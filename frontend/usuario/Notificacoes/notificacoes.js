const { obterTodas, marcarComoLida, excluir, iconePorTipo, obterDestino } = window.NotificacoesVizin;
 
const listaNaoLidasEl = document.getElementById("lista-nao-lidas");
const listaLidasEl = document.getElementById("lista-lidas");
const secaoNaoLidas = document.getElementById("secao-nao-lidas");
const secaoLidas = document.getElementById("secao-lidas");
const vazioEl = document.getElementById("notificacoes-vazio");

// As notificações vêm do back (texto pode conter nomes digitados por outros
// usuários), então tudo que entra em innerHTML passa por aqui.
function escapar(valor) {
    return String(valor ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

// Só desenha depois da 1ª carga (senão aparece "você está em dia" por um instante).
let carregado = false;
const subtituloEl = document.getElementById("notificacoes-subtitulo");
 
// ================= DEEP LINK POR TIPO =================
// O mapa "tipo de notificação -> página de destino" mora em
// notificacoes-shared.js (obterDestino), porque o toast de notificação nova,
// que aparece em qualquer página, usa exatamente o mesmo destino.
// "solicitacao_aluguel" tem tratamento próprio em criarCard().
 
function criarCard(notificacao) {
    const card = document.createElement("div");
    card.className = `notificacao-card ${notificacao.lida ? "" : "nao-lida"}`;
 
    // Se for uma solicitação de aluguel ainda pendente, mostra
    // Aprovar/Recusar no lugar do botão padrão "Marcar como lida".
    const solicitacao = notificacao.tipo === "solicitacao_aluguel" && notificacao.solicitacaoId && window.SolicitacoesVizin
        ? window.SolicitacoesVizin.obterPorId(notificacao.solicitacaoId)
        : null;
 
    let acoesHtml = "";
 
    if (solicitacao && solicitacao.status === "pendente") {
        // A decisão (aprovar/recusar) agora acontece na aba "Solicitações"
        // da página de Histórico — aqui só um atalho pra lá.
        acoesHtml += `<a class="notificacao-acao ver-solicitacao" href="/historico?tab=solicitacoes">Ver solicitação</a>`;
    } else {
        const destino = obterDestino(notificacao);
        if (destino) {
            // "Ver detalhes" já marca a notificação como lida ao clicar (ver
            // tratarClique), então não precisa também mostrar "Marcar como
            // lida" ao lado.
            acoesHtml += `<a class="notificacao-acao ver-detalhes" data-id="${escapar(notificacao.id)}" href="${escapar(destino)}">Ver detalhes</a>`;
        } else if (!notificacao.lida) {
            acoesHtml += `<button type="button" class="notificacao-acao marcar-lida" data-id="${escapar(notificacao.id)}">Marcar como lida</button>`;
        }
    }
 
    acoesHtml += `<button type="button" class="notificacao-acao excluir" data-id="${escapar(notificacao.id)}">Excluir</button>`;
 
    card.innerHTML = `
        <div class="notificacao-icone tipo-${escapar(notificacao.tipo)}">
            <i class="bi ${iconePorTipo(notificacao.tipo)}"></i>
        </div>
        <div class="notificacao-corpo">
            <div class="notificacao-topo">
                <p class="notificacao-titulo">${escapar(notificacao.titulo)}</p>
                <span class="notificacao-data">${escapar(notificacao.data)}</span>
            </div>
            <p class="notificacao-descricao">${escapar(notificacao.descricao)}</p>
            <div class="notificacao-acoes">
                ${acoesHtml}
            </div>
        </div>
    `;
 
    return card;
}
 
function renderizar() {
    if (!carregado) return;

    // ids são UUID: a ordem vem da data (mais recentes primeiro).
    const todas = obterTodas().sort((a, b) => (b.dataIso || "").localeCompare(a.dataIso || ""));
    const naoLidas = todas.filter(n => !n.lida);
    const lidas = todas.filter(n => n.lida);
 
    subtituloEl.textContent = naoLidas.length > 0
        ? `Você tem ${naoLidas.length} notifica${naoLidas.length > 1 ? "ções" : "ção"} não lida${naoLidas.length > 1 ? "s" : ""}`
        : "Você está em dia com suas notificações";
 
    listaNaoLidasEl.innerHTML = "";
    naoLidas.forEach(n => listaNaoLidasEl.appendChild(criarCard(n)));
    secaoNaoLidas.style.display = naoLidas.length > 0 ? "block" : "none";
 
    listaLidasEl.innerHTML = "";
    lidas.forEach(n => listaLidasEl.appendChild(criarCard(n)));
    secaoLidas.style.display = lidas.length > 0 ? "block" : "none";
 
    vazioEl.style.display = todas.length === 0 ? "block" : "none";
}
 
Promise.all([
    window.NotificacoesVizin.pronto,
    window.SolicitacoesVizin ? window.SolicitacoesVizin.pronto : Promise.resolve()
]).then(() => {
    carregado = true;
    renderizar();
});
 
document.addEventListener("notificacoesAtualizadas", renderizar);
document.addEventListener("solicitacoesAtualizadas", renderizar);
 
document.getElementById("secao-nao-lidas").addEventListener("click", tratarClique);
document.getElementById("secao-lidas").addEventListener("click", tratarClique);
 
function tratarClique(e) {
    const btnMarcar = e.target.closest(".marcar-lida");
    const btnExcluir = e.target.closest(".excluir");
    const linkDetalhes = e.target.closest(".ver-detalhes");
 
    if (btnMarcar) {
        marcarComoLida(btnMarcar.dataset.id);
        return;
    }
 
    if (linkDetalhes) {
        // Ao seguir pro destino da notificação, já aproveita e marca como
        // lida — não faz sentido a pessoa voltar depois só pra limpar o
        // badge de algo que ela acabou de abrir.
        marcarComoLida(linkDetalhes.dataset.id);
        return; // deixa o navegador seguir o href normalmente
    }
 
    if (btnExcluir) {
        abrirModalExcluir(btnExcluir.dataset.id);
        return;
    }
}
 
// ================= CONFIRMAÇÃO DE EXCLUSÃO =================
// Excluir era a única ação destrutiva do app sem nenhuma confirmação — um
// toque errado no celular apagava a notificação sem chance de voltar atrás.
// Reaproveita o mesmo padrão visual de modal (.modal-overlay/.modal-box) já
// usado em Retirada-objeto (vindo de fluxo-aluguel.css), então não precisa
// de CSS novo — só o HTML do modal, adicionado em index.html.
const modalExcluir = document.getElementById("modal-excluir-notificacao");
const btnModalVoltar = document.getElementById("modal-excluir-voltar");
const btnModalConfirmar = document.getElementById("modal-excluir-confirmar");
let idParaExcluir = null;
 
function abrirModalExcluir(id) {
    idParaExcluir = id;
    modalExcluir.classList.add("show");
}
 
function fecharModalExcluir() {
    idParaExcluir = null;
    modalExcluir.classList.remove("show");
}
 
btnModalVoltar.addEventListener("click", fecharModalExcluir);
 
modalExcluir.addEventListener("click", (e) => {
    if (e.target === modalExcluir) fecharModalExcluir();
});
 
btnModalConfirmar.addEventListener("click", () => {
    if (idParaExcluir === null) return;
    excluir(idParaExcluir);
    fecharModalExcluir();
});
