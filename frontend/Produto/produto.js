// ================= PROTEGER PÁGINA =================
if (!localStorage.getItem("token")) {
    window.location.href = "../Login/index.html";
}
 
// ================= LER ID DO PRODUTO NA URL =================
const params = new URLSearchParams(window.location.search);
const produtoId = params.get("id") || "1";
 
// ================= CARREGAR PRODUTO =================
/* ============================================================
   PONTO DE INTEGRAÇÃO COM O BACK-END
   GET /api/objetos/:id
   Resposta esperada:
   {
     id, titulo, descricao, categoria, preco_dia,
     localizacao, imagem,
     proprietario: { id, nome, iniciais, avaliacao }
   }
   ============================================================ */
let produto = null;
 
async function carregarProduto() {
    try {
        const response = await fetch(`/api/objetos/${produtoId}`, {
            headers: {
                "Authorization": `Bearer ${localStorage.getItem("token")}`
            }
        });
 
        if (!response.ok) throw new Error("Objeto não encontrado");
 
        produto = await response.json();
        preencherProduto(produto);
        btnSolicitar.disabled = false;
 
    } catch (err) {
        console.error(err);
        alert("Não foi possível carregar este objeto.");
    }
}
 
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
 
document.getElementById("btn-ver-perfil").addEventListener("click", () => {
    if (!produto) return;
    window.location.href = `../Perfil/index.html?id=${produto.proprietario.id}`;
});
 
// ================= CÁLCULO DE PERÍODO E TOTAL =================
const inputRetirada = document.getElementById("data-retirada");
const inputDevolucao = document.getElementById("data-devolucao");
const resumoDatas = document.getElementById("resumo-datas");
const btnSolicitar = document.getElementById("btn-solicitar");
 
// Enquanto o produto ainda não carregou, evita que o usuário solicite
btnSolicitar.disabled = true;
 
// Datas mínimas: retirada não pode ser antes de hoje
const hoje = new Date().toISOString().split("T")[0];
inputRetirada.min = hoje;
 
function calcularPeriodo() {
    if (!produto) return null;
 
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
 
function mostrarEstado(estado) {
    cardSolicitar.style.display = estado === "solicitar" ? "block" : "none";
    cardPendente.style.display = estado === "pendente" ? "block" : "none";
    cardAprovado.style.display = estado === "aprovado" ? "block" : "none";
}
 
let dadosSolicitacao = null;
let intervaloStatusSolicitacao = null;
 
/* ============================================================
   PONTO DE INTEGRAÇÃO COM O BACK-END
   POST /api/solicitacoes
   body: { objeto_id, data_retirada, data_devolucao }
   Resposta esperada: { id, status } (status inicial = "pendente")
 
   Acompanhamento do status (escolha uma das opções abaixo):
   1) Polling: GET /api/solicitacoes/:id/status a cada alguns
      segundos, respondendo { status: "pendente" | "aprovado" | "recusado" }.
      É a opção implementada abaixo via verificarStatusSolicitacao().
   2) WebSocket / notificação push avisando quando o proprietário
      responder — nesse caso, troque o polling pela escuta do evento.
   ============================================================ */
btnSolicitar.addEventListener("click", async () => {
    const periodo = calcularPeriodo();
 
    if (!periodo) {
        alert("Selecione datas de retirada e devolução válidas.");
        return;
    }
 
    dadosSolicitacao = periodo;
 
    btnSolicitar.disabled = true;
    btnSolicitar.innerHTML = `<span class="spinner"></span> Enviando...`;
 
    try {
        const response = await fetch("/api/solicitacoes", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${localStorage.getItem("token")}`
            },
            body: JSON.stringify({
                objeto_id: produto.id,
                data_retirada: periodo.retirada,
                data_devolucao: periodo.devolucao
            })
        });
 
        if (!response.ok) throw new Error("Erro ao enviar solicitação");
 
        const solicitacao = await response.json();
 
        mostrarEstado("pendente");
        verificarStatusSolicitacao(solicitacao.id);
 
    } catch (err) {
        console.error(err);
        alert("Não foi possível enviar sua solicitação. Tente novamente.");
        btnSolicitar.disabled = false;
        btnSolicitar.textContent = "Solicitar Aluguel";
    }
});
 
function verificarStatusSolicitacao(solicitacaoId) {
    intervaloStatusSolicitacao = setInterval(async () => {
        try {
            const response = await fetch(`/api/solicitacoes/${solicitacaoId}/status`, {
                headers: {
                    "Authorization": `Bearer ${localStorage.getItem("token")}`
                }
            });
 
            if (!response.ok) throw new Error("Erro ao consultar status da solicitação");
 
            const { status } = await response.json();
 
            if (status === "aprovado") {
                clearInterval(intervaloStatusSolicitacao);
                mostrarEstado("aprovado");
            } else if (status === "recusado") {
                clearInterval(intervaloStatusSolicitacao);
                alert("O proprietário recusou a solicitação.");
                mostrarEstado("solicitar");
                btnSolicitar.disabled = false;
                btnSolicitar.textContent = "Solicitar Aluguel";
            }
            // status "pendente": continua verificando
 
        } catch (err) {
            console.error(err);
        }
    }, 5000);
}
 
// ================= IR PARA O PAGAMENTO =================
document.getElementById("btn-ir-pagamento").addEventListener("click", () => {
    if (!dadosSolicitacao) return;
 
    const query = new URLSearchParams({
        produtoId: produto.id,
        retirada: dadosSolicitacao.retirada,
        devolucao: dadosSolicitacao.devolucao
    });
 
    window.location.href = `finalizar-pagamento.html?${query.toString()}`;
});
 
carregarProduto();
 