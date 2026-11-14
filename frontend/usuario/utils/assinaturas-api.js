// ============================================================
// AssinaturasAPI — cliente HTTP dos planos de anúncios (assinaturas).
// O O Vizinho só cobra PLANOS: aluguéis e multas são pagos direto entre os
// usuários (as rotas antigas de aluguel/multa respondem HTTP 410).
//
// ROTAS REAIS (contrato definitivo do back):
//   GET  /api/planos                              público — lista os planos
//   GET  /api/usuarios/me/assinatura              plano + assinatura + cota atual
//   GET  /api/usuarios/me/publicacoes             mesma cota (usado só como reserva)
//   POST /api/assinaturas                         contrata (Idempotency-Key obrigatório)
//   GET  /api/assinaturas/:id                     consulta uma assinatura
//   POST /api/assinaturas/:id/cancelar            (legado: marca cancelar_ao_final; sem botão na UI)
//   GET  /api/pagamentos-assinatura/:id           consulta um pagamento de assinatura
//
// Pagamento HOJE: só PIX, avulso (sem renovação automática). Cartão e modo
// demonstração não existem na UI/API.
//
// Depende de: utils/config.js (window.VIZIN_CONFIG.API_URL)
// ============================================================
(function () {
    "use strict";

    class ApiError extends Error {
        constructor(mensagem, status, codigo) {
            super(mensagem);
            this.name = "ApiError";
            this.status = status;         // 0 = sem resposta (rede)
            this.codigo = codigo || null; // código de negócio do back
        }
    }

    const mensagensPorCodigo = {
        assinatura_existente: "Você já tem uma contratação em andamento ou vigente. Consulte seu plano no Perfil.",
        idempotencia_conflitante: "A tentativa diverge da operação já registrada. Recarregue a página e tente de novo.",
        limite_anuncios_atingido: "Você atingiu o limite de publicações do seu plano.",
        nao_autenticado: "Sua sessão expirou. Entre novamente.",
        nao_pertence: "Este registro não pertence à sua conta.",
        nao_encontrada: "Não encontramos este registro."
    };

    async function requisitar(metodo, caminho, corpo, headersExtras = {}) {
        const base = window.VIZIN_CONFIG?.API_URL || "/api";
        const token = localStorage.getItem("token");
        const headers = {
            "Content-Type": "application/json",
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
            ...headersExtras
        };
        const enviar = (h) => fetch(base + caminho, {
            method: metodo, headers: h, credentials: "same-origin",
            body: corpo !== undefined ? JSON.stringify(corpo) : undefined
        });

        let resposta;
        try { resposta = await enviar(headers); }
        catch (_) { throw new ApiError("Sem conexão com o servidor. Verifique sua internet e tente novamente.", 0, "rede"); }

        let dados = null;
        try { dados = await resposta.json(); } catch (_) { /* 204 / vazio */ }

        if (resposta.status === 401 && token) {
            localStorage.removeItem("token");
            const semBearer = { ...headers };
            delete semBearer.Authorization;
            try {
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

    // ---------- normalização ----------
    function normalizarPlano(p) {
        if (!p) return null;
        const preco = p.preco_mensal ?? (p.preco_centavos != null ? p.preco_centavos / 100 : 0);
        return {
            id: p.id != null ? String(p.id) : null,
            codigo: p.codigo || null,
            nome: p.nome || "",
            preco_mensal: Number(preco) || 0,
            limite: Number(p.limite_publicacoes ?? p.limite_anuncios) || 0,
            descricao: p.descricao || null
        };
    }

    // Resposta de /usuarios/me/assinatura (e da rota admin equivalente) -> formato simples das telas.
    function normalizarAssinaturaAtual(dto) {
        const plano = normalizarPlano(dto?.plano) || { codigo: "gratuito", nome: "Gratuito", preco_mensal: 0, limite: 0 };
        const a = dto?.assinatura || {};
        const pub = dto?.publicacoes || {};
        const limite = Number(pub.limite ?? plano.limite) || 0;
        const usados = Number(pub.utilizadas ?? dto?.anuncios_usados) || 0;
        const disponiveis = pub.disponiveis != null ? Number(pub.disponiveis) : Math.max(limite - usados, 0);
        const gratuito = !(plano.preco_mensal > 0) || a.status === "gratuita";
        return {
            plano,
            gratuito,
            assinaturaId: a.id || null,
            statusAssinatura: a.status || (gratuito ? "gratuita" : "ativa"),
            inicioPeriodo: a.inicio_periodo || pub.periodo_inicio || null,
            fimPeriodo: a.fim_periodo || pub.periodo_fim || null,
            cancelarAoFinal: a.cancelar_ao_final === true,
            limite, usados, disponiveis,
            atingiuLimite: limite > 0 && usados >= limite
        };
    }

    // Pagamento de assinatura (resposta de POST /assinaturas e de GET /pagamentos-assinatura/:id).
    const STATUS_PAGO = ["pago", "aprovado", "confirmado"];
    const ehPago = (p) => STATUS_PAGO.includes(String(p?.status || "").toLowerCase());
    const ehPendente = (p) => String(p?.status || "").toLowerCase() === "pendente";

    window.AssinaturasAPI = {
        ApiError,
        normalizarAssinaturaAtual,
        ehPago,
        ehPendente,

        listarPlanos: async () => {
            const lista = await requisitar("GET", "/planos");
            return (Array.isArray(lista) ? lista : (lista?.dados || lista?.data || [])).map(normalizarPlano);
        },
        // O back não tem rota de checkout por plano: o resumo vem da lista pública.
        obterPlanoPorCodigo: async (codigo) => {
            const lista = await window.AssinaturasAPI.listarPlanos();
            const plano = lista.find(p => p.codigo === codigo);
            if (!plano) throw new ApiError("Este plano não existe ou não está disponível.", 404, "plano_nao_encontrado");
            return plano;
        },
        obterMinhaAssinatura: async () => normalizarAssinaturaAtual(await requisitar("GET", "/usuarios/me/assinatura")),
        obterAssinatura: (id) => requisitar("GET", `/assinaturas/${enc(id)}`),
        cancelarAoFinal: (id) => requisitar("POST", `/assinaturas/${enc(id)}/cancelar`, {}),

        // metodo: "pix" (cartão ainda não existe na interface)
        contratar: (planoCodigo, metodo, chaveIdempotencia) =>
            requisitar("POST", "/assinaturas", { plano_codigo: planoCodigo, metodo }, { "Idempotency-Key": chaveIdempotencia }),
        obterPagamento: (pagamentoId) => requisitar("GET", `/pagamentos-assinatura/${enc(pagamentoId)}`)
    };
})();