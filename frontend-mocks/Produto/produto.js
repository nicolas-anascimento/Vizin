// ================= PROTEGER PÁGINA =================
if (!localStorage.getItem("token")) {
    window.location.href = "../Login/index.html";
}

// ================= USUÁRIO LOGADO =================
const usuarioLogado = JSON.parse(localStorage.getItem("usuario") || "null");

// ================= LER ID DO PRODUTO NA URL =================
const params = new URLSearchParams(window.location.search);
const produtoId = params.get("id") || "1";

// ================= MOCK DO PRODUTO =================
// PONTO DE INTEGRAÇÃO COM O BACK-END:
// let produto = null;
// async function carregarProduto() {
//     const response = await fetch(`/api/objetos/${produtoId}`);
//     if (!response.ok) throw new Error("Objeto não encontrado");
//     produto = await response.json();
//     preencherProduto(produto);
// }
// carregarProduto();
const produto = {
    id: produtoId,
    titulo: "Furadeira Profissional Bosch",
    descricao: "Furadeira de impacto profissional, ideal para trabalhos pesados. Inclui maleta e conjunto de brocas.",
    categoria: "Ferramentas",
    preco_dia: 35,
    localizacao: "São Paulo, SP",
    imagem: "../img/sem-imagem.jpg",
    proprietario: {
        id: "maria@vizin.com",
        nome: "Maria Santos",
        iniciais: "M",
        avaliacao: 4.9
    }
};

function preencherProduto(obj) {
    document.getElementById("produto-imagem").src = obj.imagem;
    document.getElementById("produto-imagem").alt = obj.titulo;
    document.getElementById("produto-titulo").textContent = obj.titulo;
    document.getElementById("produto-preco").textContent = `R$ ${obj.preco_dia}`;
    document.getElementById("produto-localizacao").textContent = obj.localizacao;
    document.getElementById("produto-categoria").textContent = obj.categoria;
    document.getElementById("produto-descricao").textContent = obj.descricao;
    document.getElementById("proprietario-avatar").textContent = obj.proprietario.iniciais;
    document.getElementById("proprietario-nome").textContent = obj.proprietario.nome;
    document.getElementById("proprietario-avaliacao").textContent = obj.proprietario.avaliacao.toFixed(1);
    document.getElementById("pendente-proprietario-nome").textContent = obj.proprietario.nome;
}

preencherProduto(produto);

document.getElementById("btn-ver-perfil").addEventListener("click", () => {
    window.location.href = `../Perfil/index.html?id=${produto.proprietario.id}`;
});

// ================= CONVERSAR COM O PROPRIETÁRIO =================
document.getElementById("btn-conversar").addEventListener("click", () => {
    const query = new URLSearchParams({
        userId: produto.proprietario.id,
        userName: produto.proprietario.nome,
        produtoId: produto.id,
        produtoTitulo: produto.titulo
    });
    window.location.href = `../Mensagens/index.html?${query.toString()}`;
});

// ================= CÁLCULO DE PERÍODO E TOTAL =================
const inputRetirada = document.getElementById("data-retirada");
const inputDevolucao = document.getElementById("data-devolucao");
const resumoDatas = document.getElementById("resumo-datas");
const btnSolicitar = document.getElementById("btn-solicitar");

const hoje = new Date().toISOString().split("T")[0];
inputRetirada.min = hoje;

function calcularPeriodo() {
    const retirada = inputRetirada.value;
    const devolucao = inputDevolucao.value;

    if (!retirada || !devolucao) {
        resumoDatas.style.display = "none";
        return null;
    }

    const dataRetirada = new Date(retirada);
    const dataDevolucao = new Date(devolucao);
    const diffMs = dataDevolucao - dataRetirada;
    const dias = Math.round(diffMs / (1000 * 60 * 60 * 24));

    if (dias <= 0) {
        resumoDatas.style.display = "none";
        return null;
    }

    const total = dias * produto.preco_dia;

    document.getElementById("resumo-periodo").textContent = `${dias} dia${dias > 1 ? "s" : ""}`;
    document.getElementById("resumo-preco-dia").textContent = `R$ ${produto.preco_dia}`;
    document.getElementById("resumo-total").textContent = `R$ ${total}`;
    resumoDatas.style.display = "block";

    return { dias, total, retirada, devolucao };
}

[inputRetirada, inputDevolucao].forEach(input => {
    input.addEventListener("change", () => {
        inputDevolucao.min = inputRetirada.value || hoje;
        calcularPeriodo();
    });
});

// ================= ESTADOS DA SIDEBAR =================
const cardSolicitar = document.getElementById("card-solicitar");
const cardPendente = document.getElementById("card-pendente");
const cardAprovado = document.getElementById("card-aprovado");
const cardRejeitado = document.getElementById("card-rejeitado");

function mostrarEstado(estado) {
    cardSolicitar.style.display = estado === "solicitar" ? "block" : "none";
    cardPendente.style.display = estado === "pendente" ? "block" : "none";
    cardAprovado.style.display = estado === "aprovado" ? "block" : "none";
    cardRejeitado.style.display = estado === "rejeitado" ? "block" : "none";
}

let dadosSolicitacao = null;
let intervaloAcompanhamento = null;

btnSolicitar.addEventListener("click", async () => {
    const periodo = calcularPeriodo();

    if (!periodo) {
        alert("Selecione datas de retirada e devolução válidas.");
        return;
    }

    if (!usuarioLogado?.email) {
        alert("Você precisa estar logado para solicitar um aluguel.");
        return;
    }

    dadosSolicitacao = periodo;

    btnSolicitar.disabled = true;
    btnSolicitar.innerHTML = `<span class="spinner"></span> Enviando...`;

    try {
        // PONTO DE INTEGRAÇÃO COM O BACK-END:
        // POST /api/solicitacoes { objeto_id, data_retirada, data_devolucao }
        const solicitacao = SolicitacoesVizin.criar({
            produtoId: produto.id,
            produtoTitulo: produto.titulo,
            solicitanteEmail: usuarioLogado.email,
            solicitanteNome: usuarioLogado.nome,
            proprietarioEmail: produto.proprietario.id,
            dataRetirada: periodo.retirada,
            dataDevolucao: periodo.devolucao,
            dias: periodo.dias,
            total: periodo.total
        });

        // Notifica o dono, com o id da solicitação anexado — é isso que
        // permite os botões Aprovar/Recusar aparecerem na notificação dele.
        if (window.NotificacoesVizin) {
            window.NotificacoesVizin.adicionarNotificacao(
                {
                    tipo: "solicitacao_aluguel",
                    titulo: "Nova solicitação de aluguel",
                    descricao: `${usuarioLogado.nome || "Alguém"} pediu para alugar "${produto.titulo}" (${periodo.dias} dia${periodo.dias > 1 ? "s" : ""}).`,
                    data: new Date().toLocaleDateString("pt-BR"),
                    solicitacaoId: solicitacao.id
                },
                produto.proprietario.id
            );
        }

        mostrarEstado("pendente");
        acompanharSolicitacao(solicitacao.id);

    } catch (err) {
        console.error(err);
        alert("Não foi possível enviar sua solicitação. Tente novamente.");
        btnSolicitar.disabled = false;
        btnSolicitar.textContent = "Solicitar Aluguel";
    }
});

// ================= ACOMPANHAR RESPOSTA (POLLING) =================
// PONTO DE INTEGRAÇÃO COM O BACK-END:
// Trocar por WebSocket, ou por um GET periódico em /api/solicitacoes/:id.
function acompanharSolicitacao(id) {
    clearInterval(intervaloAcompanhamento);

    intervaloAcompanhamento = setInterval(() => {
        const atual = SolicitacoesVizin.obterPorId(id);
        if (!atual) return;

        if (atual.status === "aprovado") {
            clearInterval(intervaloAcompanhamento);
            mostrarEstado("aprovado");
        } else if (atual.status === "rejeitado") {
            clearInterval(intervaloAcompanhamento);
            mostrarEstado("rejeitado");
        }
    }, 1000);
}

// Retoma o estado certo se a página do produto for reaberta enquanto já
// existe uma solicitação em andamento (recarregar a aba, por exemplo).
(function retomarEstadoSeExistir() {
    if (!usuarioLogado?.email || !window.SolicitacoesVizin) return;

    const maisRecente = SolicitacoesVizin.obterDoSolicitante(usuarioLogado.email)
        .filter(s => s.produtoId === produto.id)
        .sort((a, b) => b.id - a.id)[0];

    if (!maisRecente) return;

    if (maisRecente.status === "pendente") {
        mostrarEstado("pendente");
        acompanharSolicitacao(maisRecente.id);
    } else if (maisRecente.status === "aprovado") {
        dadosSolicitacao = {
            dias: maisRecente.dias,
            total: maisRecente.total,
            retirada: maisRecente.dataRetirada,
            devolucao: maisRecente.dataDevolucao
        };
        mostrarEstado("aprovado");
    } else if (maisRecente.status === "rejeitado") {
        mostrarEstado("rejeitado");
    }
})();

// ================= TENTAR NOVAMENTE (após rejeição) =================
document.getElementById("btn-tentar-novamente").addEventListener("click", () => {
    mostrarEstado("solicitar");
    btnSolicitar.disabled = false;
    btnSolicitar.textContent = "Solicitar Aluguel";
    inputRetirada.value = "";
    inputDevolucao.value = "";
    resumoDatas.style.display = "none";
});

// ================= IR PARA O PAGAMENTO =================
document.getElementById("btn-ir-pagamento").addEventListener("click", () => {
    if (!dadosSolicitacao) return;

    const query = new URLSearchParams({
        produtoId: produto.id,
        retirada: dadosSolicitacao.retirada,
        devolucao: dadosSolicitacao.devolucao
    });

    window.location.href = `../Finalizar-pagamento/index.html?${query.toString()}`;
});