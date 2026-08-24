if (!localStorage.getItem("token")) {
    window.location.href = "../Login/index.html";
}

const { obterTodas, marcarComoLida, excluir, iconePorTipo, adicionarNotificacao } = window.NotificacoesVizin;

const listaNaoLidasEl = document.getElementById("lista-nao-lidas");
const listaLidasEl = document.getElementById("lista-lidas");
const secaoNaoLidas = document.getElementById("secao-nao-lidas");
const secaoLidas = document.getElementById("secao-lidas");
const vazioEl = document.getElementById("notificacoes-vazio");
const subtituloEl = document.getElementById("notificacoes-subtitulo");

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
        acoesHtml += `<button type="button" class="notificacao-acao aprovar" data-id="${notificacao.id}" data-solicitacao-id="${solicitacao.id}">Aprovar</button>`;
        acoesHtml += `<button type="button" class="notificacao-acao recusar" data-id="${notificacao.id}" data-solicitacao-id="${solicitacao.id}">Recusar</button>`;
    } else if (!notificacao.lida) {
        acoesHtml += `<button type="button" class="notificacao-acao marcar-lida" data-id="${notificacao.id}">Marcar como lida</button>`;
    }

    acoesHtml += `<button type="button" class="notificacao-acao excluir" data-id="${notificacao.id}">Excluir</button>`;

    card.innerHTML = `
        <div class="notificacao-icone tipo-${notificacao.tipo}">
            <i class="bi ${iconePorTipo(notificacao.tipo)}"></i>
        </div>
        <div class="notificacao-corpo">
            <div class="notificacao-topo">
                <p class="notificacao-titulo">${notificacao.titulo}</p>
                <span class="notificacao-data">${notificacao.data}</span>
            </div>
            <p class="notificacao-descricao">${notificacao.descricao}</p>
            <div class="notificacao-acoes">
                ${acoesHtml}
            </div>
        </div>
    `;

    return card;
}

function renderizar() {
    const todas = obterTodas().sort((a, b) => b.id - a.id);
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

renderizar();

document.addEventListener("notificacoesAtualizadas", renderizar);
document.addEventListener("solicitacoesAtualizadas", renderizar);

document.getElementById("secao-nao-lidas").addEventListener("click", tratarClique);
document.getElementById("secao-lidas").addEventListener("click", tratarClique);

function tratarClique(e) {
    const btnAprovar = e.target.closest(".aprovar");
    const btnRecusar = e.target.closest(".recusar");
    const btnMarcar = e.target.closest(".marcar-lida");
    const btnExcluir = e.target.closest(".excluir");

    if (btnAprovar) {
        responderSolicitacao(Number(btnAprovar.dataset.solicitacaoId), Number(btnAprovar.dataset.id), "aprovado");
        return;
    }

    if (btnRecusar) {
        responderSolicitacao(Number(btnRecusar.dataset.solicitacaoId), Number(btnRecusar.dataset.id), "rejeitado");
        return;
    }

    if (btnMarcar) {
        // PONTO DE INTEGRAÇÃO COM O BACK-END: PATCH /api/notificacoes/:id { lida: true }
        marcarComoLida(Number(btnMarcar.dataset.id));
        return;
    }

    if (btnExcluir) {
        // PONTO DE INTEGRAÇÃO COM O BACK-END: DELETE /api/notificacoes/:id
        excluir(Number(btnExcluir.dataset.id));
        return;
    }
}

// ================= APROVAR/RECUSAR UMA SOLICITAÇÃO =================
function responderSolicitacao(solicitacaoId, notificacaoId, novoStatus) {
    // PONTO DE INTEGRAÇÃO COM O BACK-END:
    // PATCH /api/solicitacoes/:id { status: "aprovado" | "rejeitado" }
    const solicitacao = window.SolicitacoesVizin.atualizarStatus(solicitacaoId, novoStatus);
    if (!solicitacao) return;

    // Avisa quem fez o pedido
    adicionarNotificacao(
        {
            tipo: novoStatus === "aprovado" ? "aluguel_aprovado" : "aluguel_rejeitado",
            titulo: novoStatus === "aprovado" ? "Solicitação aprovada!" : "Solicitação recusada",
            descricao: novoStatus === "aprovado"
                ? `Seu pedido de aluguel de "${solicitacao.produtoTitulo}" foi aprovado.`
                : `Seu pedido de aluguel de "${solicitacao.produtoTitulo}" foi recusado.`,
            data: new Date().toLocaleDateString("pt-BR"),
            solicitacaoId: solicitacao.id
        },
        solicitacao.solicitanteEmail
    );

    // Marca a notificação original (do dono) como lida — os botões
    // Aprovar/Recusar somem no próximo render, já que o status não é
    // mais "pendente".
    marcarComoLida(notificacaoId);
}