// ============================================================
// Cliente HTTP dos endpoints de pagamento.
// Único lugar do front que conhece as URLs desse domínio — o contrato
// completo (payloads, códigos de erro, regras) está em
// CONTRATO-API-PAGAMENTOS.md.
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
            this.codigo = codigo || null; // código de negócio devolvido pelo back (ex.: "ja_paga")
        }
    }

    const mensagensPorCodigo = {
        ja_paga: "Este pagamento já foi concluído.", cancelada: "Esta solicitação foi cancelada.",
        nao_aprovada: "A solicitação ainda não está aprovada.", objeto_indisponivel: "O objeto não está mais disponível.",
        prazo_expirado: "O prazo para pagamento expirou.", idempotencia_conflitante: "A tentativa diverge da operação já registrada.",
        conciliacao_pendente: "O pagamento está em conciliação.", operacao_pendente: "A operação anterior ainda está pendente.",
        pix_incompleto: "Os dados do PIX ainda estão sendo recuperados.", multa_contestada: "A multa está em contestação.",
        multa_desabilitada: "A cobrança da multa está indisponível.", pagamento_em_andamento: "Já existe um pagamento em andamento.",
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

        // ---- Cobranças (o back é a fonte de todos os valores) ----
        obterCobrancaAluguel: (solicitacaoId) => requisitar("GET", `/solicitacoes/${enc(solicitacaoId)}/pagamento`),
        obterConfirmacaoAluguel: (solicitacaoId) => requisitar("GET", `/solicitacoes/${enc(solicitacaoId)}/confirmacao-pagamento`),
        obterCobrancaMulta: (solicitacaoId) => requisitar("GET", `/solicitacoes/${enc(solicitacaoId)}/multa`),
        obterConfiguracaoPublica: () => requisitar("GET", "/configuracao-publica"),

        // ---- Pagamentos ----
        // tipo: "aluguel" | "multa". A chave de idempotência evita cobrança em
        // dobro se a requisição for repetida (clique duplo, retry após queda de rede).
        criarPagamento: (tipo, solicitacaoId, corpo, chaveIdempotencia) => {
            const caminho = tipo === "multa"
                ? `/solicitacoes/${enc(solicitacaoId)}/multa/pagamentos`
                : `/solicitacoes/${enc(solicitacaoId)}/pagamentos`;
            return requisitar("POST", caminho, corpo, { "Idempotency-Key": chaveIdempotencia });
        },
        pagarEmModoDemo: (tipo, solicitacaoId, chaveIdempotencia) => {
            const caminho = tipo === "multa"
                ? `/solicitacoes/${enc(solicitacaoId)}/multa/pagamentos/demo`
                : `/solicitacoes/${enc(solicitacaoId)}/pagamentos/demo`;
            return requisitar("POST", caminho, {}, { "Idempotency-Key": chaveIdempotencia });
        },
        obterPagamento: (pagamentoId) => requisitar("GET", `/pagamentos/${enc(pagamentoId)}`)
    };
})();
