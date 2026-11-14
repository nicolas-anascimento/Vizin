// ================= LER DADOS DA URL =================
// Esta tela confirma EXCLUSIVAMENTE o pagamento de um plano de anúncios.
// Só o id do pagamento vem da URL; tudo o mais é buscado no back — quem abrir
// esta página sem ter pago não vê uma confirmação falsa (a assinatura só é
// ativada pelo webhook do provedor).
const pagamentoId = new URLSearchParams(window.location.search).get("pagamentoId");

// ================= TELAS =================
const telas = {
    carregando: document.getElementById("confirmado-carregando"),
    sucesso: document.getElementById("confirmado-sucesso"),
    erro: document.getElementById("confirmado-erro"),
};

function mostrarTela(nome) {
    Object.entries(telas).forEach(([chave, el]) => {
        el.style.display = chave === nome ? "" : "none";
    });
}

const MENSAGENS_ERRO = {
    nao_encontrada: "Não encontramos este pagamento.",
    nao_pertence: "Este pagamento não pertence à sua conta.",
    nao_paga: "O pagamento desta assinatura ainda não foi confirmado."
};

function mostrarErro(erro) {
    document.getElementById("confirmado-erro-texto").textContent =
        MENSAGENS_ERRO[erro?.codigo] ||
        erro?.message ||
        "Não foi possível carregar os dados da assinatura. Tente novamente em instantes.";
    mostrarTela("erro");
}

document.getElementById("btn-confirmado-erro-voltar").addEventListener("click", () => {
    window.location.href = "/planos";
});

// ================= PREENCHER =================
function formatarData(valor) {
    if (!valor) return "-";
    const d = new Date(valor);
    if (Number.isNaN(d.getTime())) return "-";
    return d.toLocaleDateString("pt-BR", { timeZone: "UTC" });
}

function preencher(pagamento, atual) {
    document.getElementById("confirmado-plano-nome").textContent = pagamento.plano?.nome || atual.plano.nome;
    document.getElementById("confirmado-limite").textContent = atual.limite;
    document.getElementById("confirmado-valor").textContent = formatarPreco(pagamento.valor ?? (pagamento.valor_centavos / 100));
    document.getElementById("confirmado-inicio").textContent = formatarData(atual.inicioPeriodo);
    document.getElementById("confirmado-fim").textContent = formatarData(atual.fimPeriodo);
    const avisoDemo = document.getElementById("confirmado-demo");
    if (avisoDemo) avisoDemo.hidden = true;
}

// ================= INICIALIZAÇÃO =================
(async function iniciar() {

    mostrarTela("carregando");

    if (!pagamentoId) {
        return mostrarErro({ message: "Não foi possível identificar o pagamento." });
    }

    let pagamento, atual;
    try {
        pagamento = await AssinaturasAPI.obterPagamento(pagamentoId);
        if (!AssinaturasAPI.ehPago(pagamento)) {
            return mostrarErro({ codigo: "nao_paga" });
        }
        atual = await AssinaturasAPI.obterMinhaAssinatura(); // plano, cota e período vigentes
    } catch (erro) {
        return mostrarErro(erro);
    }

    preencher(pagamento, atual);
    mostrarTela("sucesso");
})();