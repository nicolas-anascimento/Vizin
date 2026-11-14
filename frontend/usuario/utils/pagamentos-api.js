// ============================================================
// Cliente HTTP dos endpoints de pagamento.
// O O Vizinho só processa pagamentos dos PLANOS DE ANÚNCIOS (assinaturas).
// Aluguéis e multas são combinados e pagos direto entre locador e locatário,
// fora da plataforma — por isso não há mais nenhuma chamada de cobrança
// de aluguel ou de multa aqui.
//
// Único lugar do front que conhece as URLs desse domínio.
// ROTAS ASSUMIDAS — confirmar com o back (é o único arquivo a ajustar):
//   GET    /planos                                  lista dos planos
//   GET    /planos/:id/checkout                     dados do plano p/ o checkout
//   POST   /planos/:id/pagamentos                   cria pagamento (PIX/cartão)  [Idempotency-Key]
//   POST   /planos/:id/pagamentos/demo              pagamento simulado (ambiente demo)
//   GET    /pagamentos/:id                          status de um pagamento de plano
//   GET    /assinaturas/atual                       plano atual + uso de anúncios
//   GET    /assinaturas/:id/confirmacao             dados da confirmação
//   POST   /assinaturas/atual/cancelar-renovacao    cancela a renovação
//
// Depende de: utils/config.js (window.VIZIN_CONFIG.API_URL)
// ============================================================
(function () {
    "use strict";

    class ApiError extends Error {
        constructor(mensagem, status, codigo) {
            super(mensagem);
            this.name = "ApiError";
            this.status = status;       // 0 = sem resposta (rede caiu / timeout)
            this.codigo = codigo || null; // código de negócio devolvido pelo back
        }
    }

    const mensagensPorCodigo = {
        plano_nao_encontrado: "Este plano não existe ou não está disponível.",
        plano_gratuito: "O plano gratuito não precisa de pagamento.",
        plano_ja_ativo: "Você já possui este plano ativo.",
        assinatura_em_andamento: "Já existe um pagamento de assinatura em andamento.",
        assinatura_nao_encontrada: "Não encontramos esta assinatura.",
        sem_assinatura_paga: "Você não possui uma assinatura paga para cancelar.",
        limite_anuncios_atingido: "Você atingiu o limite de anúncios do seu plano neste mês.",
        idempotencia_conflitante: "A tentativa diverge da operação já registrada.",
        conciliacao_pendente: "O pagamento está em conciliação.",
        operacao_pendente: "A operação anterior ainda está pendente.",
        pix_incompleto: "Os dados do PIX ainda estão sendo recuperados.",
        pagamento_em_andamento: "Já existe um pagamento em andamento.",
        cartao_em_uso: "Este cartão está vinculado a uma operação em andamento."
    };

    async function requisitar(metodo, caminho, corpo, headersExtras = {}) {
        const base = window.VIZIN_CONFIG?.API_URL || "/api";
        const token = localStorage.getItem("token");

        const headers = {
            "Content-Type": "application/json",
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
            ...headersExtras
        };
        const enviar = cabecalhos => fetch(base + caminho, {
            method: metodo, headers: cabecalhos, credentials: "same-origin",
            body: corpo !== undefined ? JSON.stringify(corpo) : undefined
        });
        let resposta;
        try {
            resposta = await enviar(headers);
        } catch (_) {
            throw new ApiError("Sem conexão com o servidor. Verifique sua internet e tente novamente.", 0, "rede");
        }

        let dados = null;
        try { dados = await resposta.json(); } catch (_) { /* 204 / corpo vazio */ }

        if (resposta.status === 401 && token) {
            localStorage.removeItem("token");
            try {
                const semBearer = { ...headers };
                delete semBearer.Authorization;
                resposta = await enviar(semBearer);
                try { dados = await resposta.json(); } catch (_) { dados = null; }
            } catch (_) { throw new ApiError("Sem conexão com o servidor.", 0, "rede"); }
        }

        if (resposta.status === 401) {
            localStorage.removeItem("token");
            sessionStorage.setItem("mensagemLogin", "Sua sessão expirou. Entre novamente para continuar.");
            window.location.href = "/login";
            throw new ApiError("Sessão expirada.", 401, "nao_autenticado");
        }

        if (!resposta.ok) {
            throw new ApiError(
                dados?.mensagem || dados?.message || mensagensPorCodigo[dados?.codigo] || "Não foi possível concluir a operação. Tente novamente em instantes.",
                resposta.status,
                dados?.codigo
            );
        }

        return dados;
    }

    const enc = encodeURIComponent;

    window.PagamentosAPI = {
        ApiError,

        // ---- Planos e assinatura (o back é a fonte de todos os valores e limites) ----
        listarPlanos: () => requisitar("GET", "/planos"),
        obterCheckoutPlano: (planoId) => requisitar("GET", `/planos/${enc(planoId)}/checkout`),
        obterMinhaAssinatura: () => requisitar("GET", "/assinaturas/atual"),
        obterConfirmacaoAssinatura: (assinaturaId) => requisitar("GET", `/assinaturas/${enc(assinaturaId)}/confirmacao`),
        cancelarRenovacao: () => requisitar("POST", "/assinaturas/atual/cancelar-renovacao", {}),
        obterConfiguracaoPublica: () => requisitar("GET", "/configuracao-publica"),

        // ---- Pagamentos (somente de planos) ----
        // A chave de idempotência evita cobrança em dobro se a requisição for
        // repetida (clique duplo, retry após queda de rede).
        criarPagamento: (planoId, corpo, chaveIdempotencia) =>
            requisitar("POST", `/planos/${enc(planoId)}/pagamentos`, corpo, { "Idempotency-Key": chaveIdempotencia }),
        pagarEmModoDemo: (planoId, chaveIdempotencia) =>
            requisitar("POST", `/planos/${enc(planoId)}/pagamentos/demo`, {}, { "Idempotency-Key": chaveIdempotencia }),
        obterPagamento: (pagamentoId) => requisitar("GET", `/pagamentos/${enc(pagamentoId)}`)
    };
})();