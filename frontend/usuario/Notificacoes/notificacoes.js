if (!localStorage.getItem("token")) {
    window.location.href = "/login";
}
 
const { obterTodas, marcarComoLida, excluir, iconePorTipo } = window.NotificacoesVizin;
 
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
// Cada tipo de notificação (menos "solicitacao_aluguel", que já tem seu
// próprio tratamento especial abaixo, e "resposta_email", que não carrega
// nenhum id pra apontar pra lugar nenhum) leva pra um destino diferente,
// dependendo de a locação ainda estar em andamento ou já ter terminado.
// Sem isso, a pessoa recebia "Retirada confirmada" ou "Devolução
// confirmada" e não tinha como chegar direto na locação em questão.
const DESTINO_EM_ANDAMENTO = (id) => `/status-locacao?solicitacaoId=${id}`;
const DESTINO_HISTORICO = () => `/historico`;
const DESTINO_MENSAGENS = () => `/mensagens`;
 
const TIPOS_EM_ANDAMENTO = new Set(["aluguel_aprovado", "retirada_confirmada", "lembrete", "problema_reportado"]);
const TIPOS_HISTORICO = new Set(["aluguel_rejeitado", "aluguel_cancelado", "devolucao_confirmada", "pagamento_liberado"]);

// Notificações de conta/administrativas: não são sobre uma locação
// específica, então (diferente do grupo "em andamento" acima) não
// dependem de solicitacaoId. "bloqueio_conta" e "dados_atualizados_admin"
// mandam pro Perfil — é lá que a pessoa vê os próprios dados/status.
// "anuncio_removido_admin" manda pra lista de objetos, pra ela ver o
// anúncio afetado.
//
// CORRIGIDO: "bloqueio_conta" antes estava em TIPOS_EM_ANDAMENTO, que só
// gera link quando existe solicitacaoId — mas bloquear uma conta não é
// sobre uma locação, então essa notificação nunca teria solicitacaoId e
// caía sempre no "sem destino" (só "Marcar como lida", sem "Ver detalhes").
const TIPOS_CONTA = new Map([
    ["bloqueio_conta", () => "/perfil"],
    ["dados_atualizados_admin", () => "/perfil"],
    ["anuncio_removido_admin", () => "/meus-objetos"]
]);
 
// "avaliacao_recebida" não entra em nenhum dos dois grupos acima porque não
// tem UM destino fixo: a avaliação que a pessoa recebeu pode ser sobre o
// OBJETO (dada pelo locatário, aparece na página de Produto) ou sobre ELA
// COMO LOCATÁRIA (dada pelo proprietário, aparece no próprio Perfil) — só
// dá pra saber isso comparando quem é o dono/locatário daquele aluguel com
// quem está logado agora (o destinatário desta notificação).
function obterDestinoAvaliacao(notificacao) {
    if (!notificacao.solicitacaoId || !window.SolicitacoesVizin) return DESTINO_HISTORICO();
 
    const solicitacao = window.SolicitacoesVizin.obterPorId(notificacao.solicitacaoId);
    if (!solicitacao) return DESTINO_HISTORICO();
 
    const euEraProprietario = solicitacao.souProprietario;
 
    // Eu era o dono do objeto nesse aluguel -> a avaliação que recebi é do
    // locatário sobre o OBJETO -> mora na página de Produto.
    if (euEraProprietario) {
        return `/produto?id=${solicitacao.produtoId}#avaliacoes`;
    }
 
    // Eu era o locatário -> a avaliação que recebi é do proprietário sobre
    // MIM -> mora no meu próprio Perfil, na seção de avaliações recebidas.
    return `/perfil#avaliacoes-secao`;
}
 
function obterDestino(notificacao) {
    if (notificacao.tipo === "avaliacao_recebida") return obterDestinoAvaliacao(notificacao);

    if (TIPOS_CONTA.has(notificacao.tipo)) return TIPOS_CONTA.get(notificacao.tipo)();

    if (TIPOS_EM_ANDAMENTO.has(notificacao.tipo)) {
        // Sem solicitacaoId (ex: item antigo do seed/mock) não dá pra saber
        // pra onde mandar a pessoa — cai no comportamento padrão.
        return notificacao.solicitacaoId ? DESTINO_EM_ANDAMENTO(notificacao.solicitacaoId) : null;
    }
    if (TIPOS_HISTORICO.has(notificacao.tipo)) return DESTINO_HISTORICO();
    if (notificacao.tipo === "mensagem") return DESTINO_MENSAGENS();
    return null;
}
 
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