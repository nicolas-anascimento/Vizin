// ================= LER DADOS DA URL =================
// Só o id da solicitação vem da URL. Objeto, datas e valor pago são buscados
// no back-end — quem abrir esta página sem ter pago (ou com um link
// adulterado) não vê uma confirmação falsa.
const solicitacaoId = new URLSearchParams(window.location.search).get("solicitacaoId");

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
    nao_paga: "O pagamento desta solicitação ainda não foi confirmado."
};

function mostrarErro(erro) {
    document.getElementById("confirmado-erro-texto").textContent =
        MENSAGENS_ERRO[erro?.codigo] ||
        erro?.message ||
        "Não foi possível carregar os dados do pagamento. Tente novamente em instantes.";
    mostrarTela("erro");
}

document.getElementById("btn-confirmado-erro-voltar").addEventListener("click", () => {
    window.location.href = "/historico";
});

// ================= PREENCHER =================
function formatarData(dataStr) {
    if (!dataStr) return "-";
    const [ano, mes, dia] = dataStr.split("-");
    return `${dia}/${mes}/${ano}`;
}

function preencher(c) {
    document.getElementById("confirmado-objeto-nome").textContent = c.produto.titulo;
    document.getElementById("confirmado-retirada").textContent = formatarData(c.data_retirada);
    document.getElementById("confirmado-devolucao").textContent = formatarData(c.data_devolucao);
    document.getElementById("confirmado-periodo").textContent = `${c.dias} dia${c.dias > 1 ? "s" : ""}`;
    document.getElementById("confirmado-total").textContent = formatarPreco(c.total_pago);
    const avisoDemo = document.getElementById("confirmado-demo");
    if (avisoDemo) avisoDemo.hidden = c.pagamento_demonstrativo !== true;
}

// ================= INICIALIZAÇÃO =================
(async function iniciar() {

    mostrarTela("carregando");

    if (!solicitacaoId) {
        return mostrarErro({ message: "Não foi possível identificar o pagamento." });
    }

    let confirmacao;
    try {
        confirmacao = await PagamentosAPI.obterConfirmacaoAluguel(solicitacaoId);
    } catch (erro) {
        return mostrarErro(erro);
    }

    preencher(confirmacao);
    mostrarTela("sucesso");

    // Redireciona pra retirada. A página de destino também deve buscar os
    // dados no back pelo solicitacaoId; os demais parâmetros são só conveniência.
    setTimeout(() => {
        const query = new URLSearchParams({
            produtoId: confirmacao.produto.id ?? "",
            retirada: confirmacao.data_retirada || "",
            devolucao: confirmacao.data_devolucao || "",
            solicitacaoId
        });
        window.location.href = `/retirada?${query.toString()}`;
    }, 3000);
})();
