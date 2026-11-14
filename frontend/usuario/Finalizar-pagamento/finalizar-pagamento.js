// ================= LER DADOS DA URL =================
// Este checkout serve EXCLUSIVAMENTE para a contratação de planos de anúncios.
// O aluguel é combinado e pago direto entre locador e locatário, fora do
// O Vizinho. Só o id do plano vem da URL; nome, preço e limite vêm do back.
const params = new URLSearchParams(window.location.search);
// "plano" na URL é o CÓDIGO do plano (intermediario | avancado), não o UUID.
const planoCodigo = params.get("plano");

const URL_PLANOS = "/planos";

document.getElementById("link-voltar").addEventListener("click", (e) => {
    e.preventDefault();
    window.location.href = URL_PLANOS;
});

// ================= CONTROLE DE TELAS =================
const telas = {
    carregando: document.getElementById("tela-carregando"),
    pagamento: document.getElementById("tela-pagamento"),
    erroPlano: document.getElementById("tela-erro-plano"),
};
const sidebar = document.getElementById("pagamento-sidebar");

function mostrarTela(nome) {
    Object.values(telas).forEach(el => el && (el.style.display = "none"));
    if (telas[nome]) telas[nome].style.display = "block";
    if (sidebar) sidebar.style.display = nome === "pagamento" ? "" : "none";
}

document.getElementById("btn-erro-plano-voltar")?.addEventListener("click", () => {
    window.location.href = URL_PLANOS;
});

// ================= ERROS DE NEGÓCIO (códigos devolvidos pelo back) =================
const MENSAGENS_ERRO = {
    plano_nao_encontrado: "Este plano não existe ou não está disponível para contratação.",
    plano_gratuito: "O plano gratuito não precisa de pagamento.",
    assinatura_existente: "Você já tem uma contratação em andamento ou um plano pago vigente. Consulte seu plano no Perfil.",
    idempotencia_conflitante: "Havia uma tentativa de pagamento diferente em andamento. Recarregue a página e tente de novo."
};

function mostrarErroPlano(erro) {
    CheckoutVizin.pararTudo();
    document.getElementById("erro-plano-texto").textContent =
        MENSAGENS_ERRO[erro.codigo] ||
        erro.message ||
        "Não foi possível carregar os dados da assinatura. Tente novamente em instantes.";
    mostrarTela("erroPlano");
}

// Usado pelo checkout quando o back recusa o pagamento por um motivo que
// troca a tela inteira. Retorna true = "já tratei".
function tratarErroPagamento(erro) {
    if (Object.keys(MENSAGENS_ERRO).includes(erro.codigo)) {
        mostrarErroPlano(erro);
        return true;
    }
    return false;
}

// ================= RESUMO =================
function preencherResumo(plano) {
    document.getElementById("resumo-plano-nome").textContent = plano.nome;
    document.getElementById("resumo-plano-descricao").textContent =
        `Até ${plano.limite} anúncios por período`;
    document.getElementById("resumo-plano-limite").textContent = plano.limite;
    document.getElementById("resumo-total").textContent = formatarPreco(plano.preco_mensal);
}

// ================= PÓS-PAGAMENTO =================
// Quem confirma o pagamento é o back-end (webhook do Mercado Pago). O front só
// é avisado e segue para a confirmação, que busca tudo no back pelo id do pagamento.
function irParaConfirmacao(pagamento) {
    window.location.href = pagamento?.id
        ? `/pagamento-confirmado?pagamentoId=${encodeURIComponent(pagamento.id)}`
        : URL_PLANOS;
}

// ================= INICIALIZAÇÃO DA PÁGINA =================
(async function iniciar() {

    mostrarTela("carregando");

    if (!planoCodigo) {
        document.getElementById("erro-plano-texto").textContent =
            "Não foi possível identificar o plano escolhido.";
        mostrarTela("erroPlano");
        return;
    }

    let plano;
    try {
        plano = await AssinaturasAPI.obterPlanoPorCodigo(planoCodigo);
    } catch (erro) {
        mostrarErroPlano(erro);
        return;
    }

    mostrarTela("pagamento");
    preencherResumo(plano);

    if (!(plano.preco_mensal > 0)) {
        return mostrarErroPlano({ codigo: "plano_gratuito" });
    }

    CheckoutVizin.iniciar({
        planoCodigo,
        total: plano.preco_mensal,
        aoAprovar: irParaConfirmacao,
        aoErro: tratarErroPagamento
    });
})();