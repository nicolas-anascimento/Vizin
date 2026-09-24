// ================= LER DADOS DA URL =================
// Só o id da solicitação é necessário: datas, valores e produto vêm do back.
const params = new URLSearchParams(window.location.search);
const solicitacaoId = params.get("solicitacaoId");
let produtoId = params.get("produtoId"); // só pra montar o link "voltar" (atualizado com a resposta do back)

function urlProduto() {
    return produtoId ? `/produto?id=${produtoId}` : "/historico";
}

document.getElementById("link-voltar").addEventListener("click", (e) => {
    e.preventDefault();
    window.location.href = urlProduto();
});

// ================= CONTROLE DE TELAS =================
const telas = {
    carregando: document.getElementById("tela-carregando"), // opcional
    pagamento: document.getElementById("tela-pagamento"),
    erroSolicitacao: document.getElementById("tela-erro-solicitacao"),
    objetoIndisponivel: document.getElementById("tela-objeto-indisponivel"),
    prazoExpirado: document.getElementById("tela-prazo-expirado"),
};
const sidebar = document.getElementById("pagamento-sidebar");
const bannerPrazo = document.getElementById("banner-prazo");

function mostrarTela(nome) {
    Object.values(telas).forEach(el => el && (el.style.display = "none"));
    if (telas[nome]) telas[nome].style.display = "block";
    const ehTelaFinal = nome !== "pagamento";
    if (sidebar) sidebar.style.display = ehTelaFinal ? "none" : "";
    if (bannerPrazo && ehTelaFinal) bannerPrazo.style.display = "none";
}

document.getElementById("btn-erro-solicitacao-voltar")?.addEventListener("click", () => {
    window.location.href = "/notificacoes";
});
document.getElementById("btn-objeto-indisponivel-voltar")?.addEventListener("click", () => {
    window.location.href = urlProduto();
});
document.getElementById("btn-prazo-expirado-voltar")?.addEventListener("click", () => {
    window.location.href = urlProduto();
});

// ================= ERROS DE NEGÓCIO (códigos devolvidos pelo back) =================
// Quem decide se a solicitação existe, é da pessoa logada, está aprovada,
// não foi paga/cancelada, tem prazo e o objeto está disponível é o
// back-end — aqui só traduzimos o código em tela.
const MENSAGENS_ERRO = {
    nao_encontrada: "Esta solicitação não existe ou não está mais disponível.",
    nao_pertence: "Esta solicitação não pertence à sua conta.",
    ja_paga: "Esta solicitação já foi paga anteriormente.",
    cancelada: "Esta solicitação foi cancelada e não está mais disponível para pagamento.",
    nao_aprovada: "Esta solicitação ainda não está aprovada para pagamento."
};

function mostrarErroCobranca(erro) {
    CheckoutVizin.pararTudo();
    limparPrazoPagamento();

    if (erro.codigo === "objeto_indisponivel") return mostrarTela("objetoIndisponivel");
    if (erro.codigo === "prazo_expirado") return mostrarTela("prazoExpirado");

    document.getElementById("erro-solicitacao-texto").textContent =
        MENSAGENS_ERRO[erro.codigo] ||
        erro.message ||
        "Não foi possível carregar os dados do pagamento. Tente novamente em instantes.";
    mostrarTela("erroSolicitacao");
}

// Usado pelo checkout quando o back recusa a criação do pagamento por um
// motivo que troca a tela inteira. Retorna true = "já tratei".
function tratarErroPagamento(erro) {
    const codigosDeTela = ["objeto_indisponivel", "prazo_expirado", "ja_paga", "cancelada", "nao_aprovada", "nao_encontrada", "nao_pertence"];
    if (codigosDeTela.includes(erro.codigo)) {
        mostrarErroCobranca(erro);
        return true;
    }
    return false;
}

// ================= PRAZO PARA PAGAR =================
// A regra (cancelar a solicitação quando o prazo acaba) roda no servidor.
// Aqui só mostramos a contagem regressiva, calculada a partir de
// "prazo_restante_segundos" (relativo — não depende do relógio do
// aparelho estar certo).
let prazoInterval = null;

function iniciarPrazoPagamento(restanteSegundos) {
    if (!bannerPrazo || typeof restanteSegundos !== "number") return;

    const limite = Date.now() + restanteSegundos * 1000;
    bannerPrazo.style.display = "flex";

    function tick() {
        const restanteMs = limite - Date.now();
        if (restanteMs <= 0) {
            limparPrazoPagamento();
            CheckoutVizin.pararTudo();
            mostrarTela("prazoExpirado");
            return;
        }
        const horas = Math.floor(restanteMs / 3600000);
        const min = Math.floor((restanteMs % 3600000) / 60000);
        document.getElementById("banner-prazo-tempo").textContent =
            horas > 0 ? `${horas}h ${String(min).padStart(2, "0")}min` : `${min} min`;
        bannerPrazo.classList.toggle("banner-urgente", restanteMs < 3 * 60 * 60 * 1000);
    }

    tick();
    prazoInterval = setInterval(tick, 30 * 1000);
}

function limparPrazoPagamento() {
    if (prazoInterval) clearInterval(prazoInterval);
    prazoInterval = null;
}

// ================= RESUMO =================
function formatarData(dataStr) {
    if (!dataStr) return "-";
    const [ano, mes, dia] = dataStr.split("-");
    return `${dia}/${mes}/${ano}`;
}

function preencherResumo(c) {
    document.getElementById("resumo-imagem").src = c.produto.imagem || "/assets/usuario/img/sem-imagem.jpg";
    document.getElementById("resumo-imagem").alt = c.produto.titulo;
    document.getElementById("resumo-produto-nome").textContent = c.produto.titulo;
    document.getElementById("resumo-produto-categoria").textContent = c.produto.categoria || "";
    document.getElementById("resumo-periodo").textContent = `${c.dias} dia${c.dias > 1 ? "s" : ""}`;
    document.getElementById("resumo-retirada").textContent = formatarData(c.data_retirada);
    document.getElementById("resumo-devolucao").textContent = formatarData(c.data_devolucao);
    document.getElementById("resumo-preco-dia").textContent = formatarPreco(c.preco_dia);
    document.getElementById("resumo-subtotal").textContent = formatarPreco(c.subtotal);
    document.getElementById("resumo-taxa-servico").textContent = formatarPreco(c.taxa_servico);
    document.getElementById("resumo-total").textContent = formatarPreco(c.total);
}

// ================= PÓS-PAGAMENTO =================
// Quem marca a solicitação como "paga" é o back-end (webhook do gateway) —
// o front só é avisado (status "aprovado") e segue para a confirmação, que
// busca tudo no back pelo solicitacaoId (nada de valor/datas na URL).
function irParaConfirmacao() {
    limparPrazoPagamento();
    window.location.href = `/pagamento-confirmado?solicitacaoId=${encodeURIComponent(solicitacaoId)}`;
}

// ================= INICIALIZAÇÃO DA PÁGINA =================
(async function iniciar() {

    mostrarTela("carregando");

    if (!solicitacaoId) {
        document.getElementById("erro-solicitacao-texto").textContent =
            "Não foi possível identificar a solicitação deste pagamento.";
        mostrarTela("erroSolicitacao");
        return;
    }

    let cobrancaAtual;
    try {
        cobrancaAtual = await PagamentosAPI.obterCobrancaAluguel(solicitacaoId);
    } catch (erro) {
        mostrarErroCobranca(erro);
        return;
    }

    produtoId = cobrancaAtual.produto.id ?? produtoId;

    mostrarTela("pagamento");
    preencherResumo(cobrancaAtual);
    iniciarPrazoPagamento(cobrancaAtual.prazo_restante_segundos);

    CheckoutVizin.iniciar({
        tipo: "aluguel",
        solicitacaoId,
        total: cobrancaAtual.total,
        aoAprovar: irParaConfirmacao,
        aoErro: tratarErroPagamento
    });
})();
