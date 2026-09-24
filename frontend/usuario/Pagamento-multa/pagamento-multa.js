// ================= LER DADOS DA URL =================
const params = new URLSearchParams(window.location.search);
const solicitacaoId = params.get("solicitacaoId");

document.getElementById("link-voltar").addEventListener("click", (e) => {
    e.preventDefault();
    window.location.href = solicitacaoId
        ? `/status-locacao?solicitacaoId=${solicitacaoId}`
        : "/historico";
});

// ================= CONTROLE DE TELAS =================
const telas = {
    carregando: document.getElementById("tela-carregando"), // opcional
    pagamento: document.getElementById("tela-pagamento"),
    sucesso: document.getElementById("tela-sucesso"),
    erroSolicitacao: document.getElementById("tela-erro-solicitacao"),
};
const sidebar = document.getElementById("pagamento-sidebar");
const bannerBloqueio = document.getElementById("banner-bloqueio");

function mostrarTela(nome) {
    Object.values(telas).forEach(el => el && (el.style.display = "none"));
    if (telas[nome]) telas[nome].style.display = "block";
    if (sidebar) sidebar.style.display = nome === "pagamento" ? "" : "none";
    // O aviso de bloqueio só faz sentido enquanto a pessoa ainda pode pagar.
    if (bannerBloqueio) bannerBloqueio.style.display = nome === "pagamento" ? "flex" : "none";
}

document.getElementById("btn-erro-solicitacao-voltar")?.addEventListener("click", () => {
    window.location.href = "/historico";
});

// ================= ERROS DE NEGÓCIO (códigos devolvidos pelo back) =================
// Quem decide se a locação existe, é da pessoa logada, tem multa
// pendente e ainda não foi paga é o back-end.
const MENSAGENS_ERRO = {
    nao_encontrada: "Esta solicitação não existe ou não está mais disponível.",
    nao_pertence: "Esta cobrança não pertence à sua conta.",
    sem_multa: "Esta locação não tem nenhuma multa por atraso registrada.",
    ja_paga: "Esta multa já foi paga anteriormente.",
    multa_contestada: "Esta multa está em contestação. Aguarde a análise antes de pagar.",
    multa_desabilitada: "O pagamento desta multa está indisponível no momento.",
    pagamento_em_andamento: "Já existe um pagamento em andamento. Consulte o status antes de tentar novamente.",
    conciliacao_pendente: "O pagamento está em conciliação. Aguarde a confirmação.",
    operacao_pendente: "A operação anterior ainda está pendente. Aguarde a confirmação.",
    pix_incompleto: "O código PIX ainda está sendo recuperado. Consulte novamente em instantes."
};

function mostrarErroCobranca(erro) {
    CheckoutVizin.pararTudo();
    document.getElementById("erro-solicitacao-texto").textContent =
        MENSAGENS_ERRO[erro.codigo] ||
        erro.message ||
        "Não foi possível carregar os dados da cobrança. Tente novamente em instantes.";
    mostrarTela("erroSolicitacao");
}

// Retorna true = "já tratei" (troca a tela inteira).
function tratarErroPagamento(erro) {
    if (Object.keys(MENSAGENS_ERRO).includes(erro.codigo)) {
        mostrarErroCobranca(erro);
        return true;
    }
    return false;
}

// ================= RESUMO =================
function preencherResumo(c) {
    document.getElementById("resumo-imagem").src = c.produto.imagem || "/assets/usuario/img/sem-imagem.jpg";
    document.getElementById("resumo-imagem").alt = c.produto.titulo || "";
    document.getElementById("resumo-produto-nome").textContent = c.produto.titulo || "";
    document.getElementById("resumo-produto-categoria").textContent = c.produto.categoria || "";

    document.getElementById("resumo-dias-atraso").textContent =
        `${c.dias_atraso} dia${c.dias_atraso > 1 ? "s" : ""}`;
    document.getElementById("resumo-valor-dia").textContent = formatarPreco(c.valor_dia);
    document.getElementById("resumo-total").textContent = formatarPreco(c.valor_total);
    document.getElementById("resumo-plataforma").textContent = formatarPreco(c.valor_plataforma);
    document.getElementById("resumo-proprietario").textContent = formatarPreco(c.valor_proprietario);
    document.getElementById("resumo-status").textContent = c.status || "—";

    // Link "Fale com o Suporte" — leva pra aba de Denúncia (motivo "Problema
    // com pagamento ou reembolso") com assunto/mensagem/aluguel já preenchidos.
    // Ajuste o caminho abaixo se a pasta de Suporte tiver outro nome.
    const assunto = `Multa por atraso — Locação #${solicitacaoId}`;
    const mensagem = `Acho que a multa da locação #${solicitacaoId} ("${c.produto.titulo}"), no valor de ${formatarPreco(c.valor_total)} (${c.dias_atraso} dia(s) de atraso), está incorreta.\n\nMotivo: `;
    const querySuporte = new URLSearchParams({
        tipo: "denuncia",
        motivo: "pagamento",
        aluguelId: String(solicitacaoId),
        produtoTitulo: c.produto.titulo || "",
        assunto,
        mensagem
    });
    document.getElementById("link-suporte").href = `/suporte?${querySuporte.toString()}`;
}

// ================= PÓS-PAGAMENTO =================
// Quem marca a multa como paga é o back-end (webhook do gateway).
// A locação já estava "concluida" antes da multa (ela nunca bloqueou esse
// status), então "continuar" é só seguir pra próxima etapa: avaliar.
document.getElementById("btn-continuar-avaliacao").addEventListener("click", () => {
    window.location.href = `/avaliacao?solicitacaoId=${solicitacaoId}`;
});

// ================= INICIALIZAÇÃO DA PÁGINA =================
(async function iniciar() {

    mostrarTela("carregando");

    if (!solicitacaoId) {
        document.getElementById("erro-solicitacao-texto").textContent =
            "Não foi possível identificar a locação desta cobrança.";
        mostrarTela("erroSolicitacao");
        return;
    }

    let cobranca;
    try {
        cobranca = await PagamentosAPI.obterCobrancaMulta(solicitacaoId);
    } catch (erro) {
        mostrarErroCobranca(erro);
        return;
    }

    mostrarTela("pagamento");
    preencherResumo(cobranca);

    CheckoutVizin.iniciar({
        tipo: "multa",
        solicitacaoId,
        total: cobranca.valor_total,
        aoAprovar: () => mostrarTela("sucesso"),
        aoErro: tratarErroPagamento
    });
})();
