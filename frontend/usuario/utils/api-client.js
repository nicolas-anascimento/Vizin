// ============================================================
// Cliente HTTP único do front (window.ApiVizin).
// Todos os módulos que falam com o back (pagamentos, solicitações,
// notificações, retirada/devolução, relatos...) usam ESTE arquivo —
// é o único lugar que sabe da URL base, do token e do formato de erro.
//
// Carregar DEPOIS de utils/config.js e ANTES dos módulos que o usam.
// ============================================================
(function () {
    "use strict";

    class ApiError extends Error {
        constructor(mensagem, status, codigo) {
            super(mensagem);
            this.name = "ApiError";
            this.status = status;         // 0 = sem resposta (rede caiu)
            this.codigo = codigo || null; // código de negócio do back (ex.: "ja_paga")
        }
    }

    const mensagensPorCodigo = {
        nao_encontrada: "O registro solicitado não foi encontrado.", nao_pertence: "Você não tem acesso a este registro.",
        ja_paga: "Este pagamento já foi concluído.", cancelada: "Esta solicitação foi cancelada.",
        nao_aprovada: "A solicitação ainda não está aprovada.", objeto_indisponivel: "O objeto não está mais disponível.",
        prazo_expirado: "O prazo desta operação expirou.", idempotencia_conflitante: "A tentativa diverge da operação já registrada.",
        conciliacao_pendente: "A operação está em conciliação.", operacao_pendente: "A operação anterior ainda está pendente.",
        pix_incompleto: "Os dados do PIX ainda estão sendo recuperados.", multa_contestada: "A multa está em contestação.",
        multa_desabilitada: "A cobrança da multa está indisponível.", pagamento_em_andamento: "Já existe um pagamento em andamento.",
        cartao_em_uso: "Este cartão está vinculado a uma operação em andamento.", decisao_concorrente: "Outra decisão foi registrada ao mesmo tempo.",
        usuario_com_multa_pendente: "Quite ou conteste a multa pendente antes de continuar.",
        usuario_com_devolucao_pendente: "Conclua a devolução pendente antes de continuar.",
        admin_required: "Esta ação exige uma conta administradora."
    };

    function baseUrl() {
        return window.VIZIN_CONFIG?.API_URL || "/api";
    }

    // opcoes: { headers, comCabecalhos }
    //   comCabecalhos = true  -> devolve { dados, cabecalhos, status }
    //   corpo instanceof FormData -> multipart (o navegador define o Content-Type)
    async function requisitar(metodo, caminho, corpo, opcoes = {}) {
        const token = localStorage.getItem("token");
        const ehFormData = typeof FormData !== "undefined" && corpo instanceof FormData;

        const headers = {
            ...(ehFormData ? {} : { "Content-Type": "application/json" }),
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
            ...(opcoes.headers || {})
        };

        const enviar = (cabecalhos) => fetch(baseUrl() + caminho, {
            method: metodo,
            headers: cabecalhos,
            credentials: "same-origin",
            body: corpo === undefined ? undefined : (ehFormData ? corpo : JSON.stringify(corpo))
        });
        let resposta;
        try {
            resposta = await enviar(headers);
        } catch (_) {
            throw new ApiError("Sem conexão com o servidor. Verifique sua internet e tente novamente.", 0, "rede");
        }

        let dados = null;
        try { dados = await resposta.json(); } catch (_) { /* 204 / corpo vazio */ }

        if (resposta.status === 401 && token && !/senha atual incorreta/i.test(dados?.mensagem || dados?.message || "")) {
            localStorage.removeItem("token");
            try {
                const semBearer = { ...headers };
                delete semBearer.Authorization;
                resposta = await enviar(semBearer);
                try { dados = await resposta.json(); } catch (_) { dados = null; }
            } catch (_) { throw new ApiError("Sem conexão com o servidor.", 0, "rede"); }
        }

        if (resposta.status === 401 && !/senha atual incorreta/i.test(dados?.mensagem || dados?.message || "")) {
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

        if (opcoes.comCabecalhos) return { dados, cabecalhos: resposta.headers, status: resposta.status };
        return dados;
    }

    // Listagens paginadas (?page=&limit=): usa X-Total-Count para percorrer todas as páginas.
    async function listarTodas(caminho) {
        const sep = caminho.includes("?") ? "&" : "?";
        let pagina = 1;
        let totalPaginas = 1;
        let tudo = [];

        do {
            const { dados, cabecalhos } = await requisitar(
                "GET", `${caminho}${sep}page=${pagina}&limit=100`, undefined, { comCabecalhos: true }
            );
            tudo = tudo.concat(Array.isArray(dados) ? dados : []);
            const total = Number(cabecalhos.get("X-Total-Count"));
            totalPaginas = Number.isFinite(total) && total >= 0
                ? Math.ceil(total / 100)
                : (Array.isArray(dados) && dados.length === 100 ? pagina + 1 : pagina);
            pagina++;
        } while (pagina <= totalPaginas);

        return tudo;
    }

    // Fotos/anexos são PRIVADOS: o back só entrega com autenticação, e uma
    // <img src> não envia o header Authorization. Por isso baixamos com fetch
    // (com o token) e devolvemos uma URL local (blob:) que a tag <img> aceita.
    // O caminho vem do back como "/uploads/..." (na raiz do servidor, não em /api).
    const blobs = new Map();

    function origemApi() {
        return new URL(baseUrl(), window.location.href).origin;
    }

    function urlBlob(caminho) {
        if (!caminho) return Promise.resolve(null);
        if (/^(https?:|blob:|data:)/i.test(caminho)) return Promise.resolve(caminho);
        if (blobs.has(caminho)) return blobs.get(caminho);

        const token = localStorage.getItem("token");
        const promessa = (async () => {
            const resposta = await fetch(origemApi() + caminho, {
                headers: token ? { Authorization: `Bearer ${token}` } : {}
            });
            if (!resposta.ok) throw new ApiError("Não foi possível carregar a imagem.", resposta.status, "imagem_indisponivel");
            return URL.createObjectURL(await resposta.blob());
        })();

        blobs.set(caminho, promessa);
        promessa.catch(() => blobs.delete(caminho)); // permite tentar de novo
        return promessa;
    }

    // ================= LIMPEZA DOS RESÍDUOS DO MOCK =================
    // Antes da API real, solicitações, notificações, fotos (em base64!) e
    // preferências ficavam no localStorage. Esses dados agora moram no back;
    // se ficarem aqui só ocupam espaço (fotos em base64 estouram a cota) e
    // podem confundir. Roda uma única vez por navegador.
    (function limparResiduosDoMock() {
        const MARCA = "vizin_mock_limpo_v1";
        try {
            if (localStorage.getItem(MARCA)) return;

            const exatas = new Set([
                "solicitacoes", "vizin_retiradas_status", "vizin_devolucoes_status",
                "vizin_relatos_problema", "vizin_lembretes_enviados",
                "vizin_avisos_atraso_devolucao", "vizin_avisos_pendente_sem_resposta"
            ]);
            const prefixos = ["notificacoes_", "vizin_notif_prefs_", "vizin_cartoes_"];

            Object.keys(localStorage).forEach(chave => {
                if (exatas.has(chave) || prefixos.some(p => chave.startsWith(p))) {
                    localStorage.removeItem(chave);
                }
            });
            ["vizin_sim_papel_override", "vizin_sim_mensagem_disparada"].forEach(k => sessionStorage.removeItem(k));

            localStorage.setItem(MARCA, "1");
        } catch (_) { /* storage indisponível: ignora */ }
    })();

    window.ApiVizin = {
        ApiError,
        requisitar,
        listarTodas,
        urlBlob,
        get: (c, o) => requisitar("GET", c, undefined, o),
        post: (c, corpo, o) => requisitar("POST", c, corpo, o),
        patch: (c, corpo, o) => requisitar("PATCH", c, corpo, o),
        put: (c, corpo, o) => requisitar("PUT", c, corpo, o),
        delete: (c, o) => requisitar("DELETE", c, undefined, o)
    };
})();
