// ================= PROTEGER PÁGINA =================
if (!localStorage.getItem("token")) {
    window.location.href = "../Login/index.html";
}

// notificacoes-shared.js precisa ser carregado ANTES deste arquivo
// (ele expõe window.NotificacoesVizin com toda a lógica de dados).
const { obterTodas, marcarComoLida, excluir, iconePorTipo } = window.NotificacoesVizin;

const listaNaoLidasEl = document.getElementById("lista-nao-lidas");
const listaLidasEl = document.getElementById("lista-lidas");
const secaoNaoLidas = document.getElementById("secao-nao-lidas");
const secaoLidas = document.getElementById("secao-lidas");
const vazioEl = document.getElementById("notificacoes-vazio");
const subtituloEl = document.getElementById("notificacoes-subtitulo");

function criarCard(notificacao) {
    const card = document.createElement("div");
    card.className = `notificacao-card ${notificacao.lida ? "" : "nao-lida"}`;

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
                ${notificacao.lida ? "" : `<button type="button" class="notificacao-acao marcar-lida" data-id="${notificacao.id}">Marcar como lida</button>`}
                <button type="button" class="notificacao-acao excluir" data-id="${notificacao.id}">Excluir</button>
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

// Re-renderiza automaticamente quando a lista muda — seja por uma ação do
// próprio usuário nesta página, seja por uma notificação simulada chegando
// (ver notificacoes-shared.js) enquanto esta página está aberta.
document.addEventListener("notificacoesAtualizadas", renderizar);

// ================= AÇÕES (delegação de eventos) =================
document.getElementById("secao-nao-lidas").addEventListener("click", tratarClique);
document.getElementById("secao-lidas").addEventListener("click", tratarClique);

function tratarClique(e) {
    const btnMarcar = e.target.closest(".marcar-lida");
    const btnExcluir = e.target.closest(".excluir");

    if (btnMarcar) {
        // PONTO DE INTEGRAÇÃO COM O BACK-END:
        // PATCH /api/notificacoes/:id { lida: true }
        marcarComoLida(Number(btnMarcar.dataset.id));
        return;
    }

    if (btnExcluir) {
        // PONTO DE INTEGRAÇÃO COM O BACK-END:
        // DELETE /api/notificacoes/:id
        excluir(Number(btnExcluir.dataset.id));
        return;
    }
}
