/* ===================================================
   INCLUIR ESSE SCRIPT EM TODAS AS PÁGINAS QUE CARREGAM O HEADER
   (depois de config.js, api-client.js, frame.js e logout.js), pois é ele quem:
   - Mantém o número de notificações não lidas em cima do sino do menu
   - Mantém o número de mensagens não lidas em cima do ícone de Mensagens
   - Mostra o toast quando chega uma notificação nova
   - Expõe window.NotificacoesVizin, usado pela página notificacoes.js

   API REAL: quem GERA as notificações é o back-end (solicitação, aprovação,
   cancelamento, retirada/devolução, lembretes, atraso, avaliação, multa,
   mensagem, problema reportado). O front só lista, marca como lida e exclui.
   Ids são UUID (string) — nunca converter com Number().

   Rotas: GET /notificacoes?limit=100 · PATCH /notificacoes/:id {lida:true} ·
          DELETE /notificacoes/:id · PATCH /notificacoes/ler-todas ·
          GET|PUT /usuarios/preferencias-notificacao
   Sem WebSocket: polling a cada 20 s (o back adotou polling neste contrato).
   =================================================== */

(function () {
    "use strict";

    if (!window.ApiVizin) {
        console.error("utils/api-client.js (e utils/config.js) precisam ser carregados ANTES deste script. Rode aplicar-scripts-html.py.");
        return;
    }

    const Api = window.ApiVizin;
    const enc = encodeURIComponent;
    const INTERVALO_POLLING_MS = 20 * 1000;

    let cache = [];
    let primeiraCargaFeita = false;
    let carregando = null;
    let totalNaoLidasServidor = 0;

    async function listarTodasNotificacoes() {
        const todas = [];
        let page = 1;
        let total = 0;
        do {
            const { dados, cabecalhos } = await Api.requisitar("GET", `/notificacoes?page=${page}&limit=100`, undefined, { comCabecalhos: true });
            if (!Array.isArray(dados)) throw new Error("Resposta de notificações inválida");
            todas.push(...dados);
            total = Number(cabecalhos.get("X-Total-Count"));
            if (!Number.isFinite(total)) total = todas.length + (dados.length === 100 ? 1 : 0);
            page++;
        } while (todas.length < total);
        return todas;
    }

    // Mantido só por compatibilidade com telas antigas — identificação de
    // usuário agora é por id (ver SolicitacoesVizin.usuarioId()).
    function usuarioAtual() {
        const usuario = JSON.parse(localStorage.getItem("usuario") || "null");
        return usuario?.email || "convidado";
    }

    // ================= NORMALIZAÇÃO =================
    function normalizar(n) {
        const iso = n.data || n.criado_em || null;
        const dataValida = iso && !Number.isNaN(Date.parse(iso));
        return {
            id: String(n.id),
            tipo: n.tipo,
            titulo: n.titulo || "",
            descricao: n.descricao || n.mensagem || "",
            data: dataValida ? new Date(iso).toLocaleDateString("pt-BR") : (iso || ""),
            dataIso: dataValida ? iso : null,
            lida: !!n.lida,
            solicitacaoId: n.solicitacao_id ? String(n.solicitacao_id) : null,
            // usado pela página de Mensagens para marcar como lidas as notificações de uma conversa
            conversaId: (n.conversaId ?? n.conversa_id ?? n.conversation_id) ? String(n.conversaId ?? n.conversa_id ?? n.conversation_id) : null
        };
    }

    function avisarMudanca() {
        atualizarBadge();
        document.dispatchEvent(new CustomEvent("notificacoesAtualizadas"));
    }

    // ================= CARGA (polling) =================
    async function carregar() {
        if (!localStorage.getItem("token")) return;
        if (carregando) return carregando;

        carregando = (async () => {
            try {
                const [lista, contagem] = await Promise.all([
                    listarTodasNotificacoes(), Api.get("/notificacoes/nao-lidas/contagem")
                ]);
                const novas = lista.map(normalizar);
                totalNaoLidasServidor = Number(contagem.quantidade) || 0;

                const idsAntigos = new Set(cache.map(n => n.id));
                const chegaram = primeiraCargaFeita
                    ? novas.filter(n => !n.lida && !idsAntigos.has(n.id))
                    : [];

                const mudou = JSON.stringify(novas) !== JSON.stringify(cache);
                cache = novas;
                primeiraCargaFeita = true;

                if (mudou) avisarMudanca();
                // Toast/som só das que chegaram enquanto a página estava aberta.
                if (chegaram.length > 0) mostrarToastNotificacao(chegaram[0]);
            } finally {
                carregando = null;
            }
        })();

        return carregando;
    }

    const pronto = carregar().catch(err => console.error("Não foi possível carregar as notificações:", err));

    setInterval(() => { if (!document.hidden) carregar().catch(() => {}); }, INTERVALO_POLLING_MS);
    document.addEventListener("visibilitychange", () => {
        if (!document.hidden) carregar().catch(() => {});
    });

    // ================= LEITURA / ESCRITA =================
    function obterTodas() {
        return [...cache];
    }

    function contarNaoLidas() {
        return totalNaoLidasServidor;
    }

    // Atualiza a tela na hora (otimista) e desfaz se o back recusar.
    async function marcarComoLida(id) {
        const alvo = String(id);
        const antes = cache;
        cache = cache.map(n => n.id === alvo ? { ...n, lida: true } : n);
        avisarMudanca();
        try {
            await Api.patch(`/notificacoes/${enc(alvo)}`, { lida: true });
        } catch (erro) {
            console.error("Não foi possível marcar como lida:", erro);
            cache = antes;
            avisarMudanca();
        }
    }

    async function excluir(id) {
        const alvo = String(id);
        const antes = cache;
        cache = cache.filter(n => n.id !== alvo);
        avisarMudanca();
        try {
            await Api.delete(`/notificacoes/${enc(alvo)}`);
        } catch (erro) {
            console.error("Não foi possível excluir a notificação:", erro);
            cache = antes;
            avisarMudanca();
        }
    }

    async function marcarTodasComoLidas() {
        const antes = cache;
        cache = cache.map(n => ({ ...n, lida: true }));
        avisarMudanca();
        try {
            await Api.patch("/notificacoes/ler-todas", {});
        } catch (erro) {
            console.error("Não foi possível marcar todas como lidas:", erro);
            cache = antes;
            avisarMudanca();
        }
    }

    // ================= PREFERÊNCIAS DE NOTIFICAÇÃO =================
    // Persistidas no back (GET/PUT /usuarios/preferencias-notificacao). Eventos
    // críticos de transação (dinheiro, bloqueio, disputa) não são desligáveis.
    const PREFERENCIAS_PADRAO = {
        solicitacao_recebida: true,
        solicitacao_respondida: true,
        lembretes_aluguel: true,
        avaliacao_recebida: true,
        mensagens: true,
        novidades: false
    };

    let preferenciasCache = { ...PREFERENCIAS_PADRAO };

    async function carregarPreferencias() {
        if (!localStorage.getItem("token")) return preferenciasCache;
        const dados = await Api.get("/usuarios/preferencias-notificacao");
        preferenciasCache = { ...PREFERENCIAS_PADRAO, ...(dados?.preferencias || dados || {}) };
        return preferenciasCache;
    }

    function obterPreferencias() {
        return { ...preferenciasCache };
    }

    async function salvarPreferencias(prefs) {
        const dados = await Api.put("/usuarios/preferencias-notificacao", prefs);
        preferenciasCache = { ...PREFERENCIAS_PADRAO, ...prefs, ...(dados?.preferencias || {}) };
        return preferenciasCache;
    }

    carregarPreferencias().catch(() => { /* usa os padrões */ });

    // ================= ÍCONE POR TIPO =================
    function iconePorTipo(tipo) {
        switch (tipo) {
            case "aluguel_confirmado": return "bi-check-lg";
            case "avaliacao": return "bi-star-fill";
            case "lembrete": return "bi-bell";
            case "solicitacao_aluguel": return "bi-inbox";
            case "aluguel_aprovado": return "bi-check-lg";
            case "aluguel_rejeitado": return "bi-x-lg";
            case "retirada_confirmada": return "bi-camera-fill";
            case "devolucao_confirmada": return "bi-arrow-counterclockwise";
            case "pagamento_liberado": return "bi-cash-coin";
            case "avaliacao_recebida": return "bi-star-fill";
            case "aluguel_cancelado": return "bi-x-circle";
            case "mensagem": return "bi-chat-dots-fill";
            case "resposta_email": return "bi-envelope-check-fill";
            case "bloqueio_conta": return "bi-slash-circle";
            case "problema_reportado": return "bi-flag-fill";
            case "multa_paga": return "bi-receipt";
            case "multa_contestada": return "bi-shield-exclamation";
            case "dados_atualizados_admin": return "bi-pencil-square";
            case "anuncio_removido_admin": return "bi-x-octagon-fill";
            default: return "bi-bell";
        }
    }
 
    // ================= BADGES NO MENU (sino + mensagens + histórico) =================
    // O header é injetado dinamicamente em #header pelo frame.js. Só mexemos
    // em ATRIBUTOS (classe e data-attribute) dos links já existentes, com um
    // setInterval leve — sem MutationObserver, então não há risco de loop.
    //
    // Notificações "mensagem" alimentam a badge de Mensagens; as demais, a do
    // sino. "solicitacao_aluguel" não entra no sino: a contagem dela aparece
    // no ícone de Histórico (aba Solicitações).
    function atualizarBadge() {
        const headerEl = document.getElementById("header");
        const bottomNavEl = document.querySelector(".bottom-nav");
        const raizes = [headerEl, bottomNavEl].filter(Boolean);
        if (!raizes.length) return;

        const totalSino = Math.max(0, totalNaoLidasServidor - cache.filter(n => !n.lida && ["mensagem", "solicitacao_aluguel"].includes(n.tipo)).length);
        const totalMensagens = cache.filter(n => !n.lida && n.tipo === "mensagem").length;
        const totalSolicitacoesPendentes = window.SolicitacoesVizin
            ? window.SolicitacoesVizin.contarPendentesComoProprietario()
            : 0;

        aplicarBadgeNoIcone(raizes, "i.bi-bell", "/notificacoes", totalSino);
        aplicarBadgeNoIcone(raizes, "i.bi-chat-dots", "/mensagens", totalMensagens);
        aplicarBadgeNoIcone(raizes, "i.bi-clock-history", "/historico?tab=solicitacoes", totalSolicitacoesPendentes);
    }

    function aplicarBadgeNoIcone(raizes, seletorIcone, hrefPadrao, total) {
        raizes.forEach(raiz => {
            raiz.querySelectorAll(seletorIcone).forEach(icone => {
                const link = icone.closest("a");
                if (!link) return;
 
                // Reaproveita o mesmo estilo visual de badge já usado no sino —
                // não precisa de nenhuma classe/CSS novo.
                link.classList.add("link-notificacoes");
 
                if (link.getAttribute("href") === "#" || !link.getAttribute("href")) {
                    link.setAttribute("href", hrefPadrao);
                }
 
                if (total > 0) {
                    link.dataset.badgeCount = total > 9 ? "9+" : String(total);
                } else {
                    delete link.dataset.badgeCount;
                }
            });
        });
    }
 
    // Roda assim que possível e depois verifica periodicamente — cobre tanto
    // o caso do header já estar pronto quanto o de ser injetado depois.
    atualizarBadge();
    setInterval(atualizarBadge, 1500);

    // ================= SOM =================
    // Gerado via Web Audio API (sem precisar de arquivo de áudio externo).
    // variante "notificacao" = duas notas (som de notificação chegando)
    // variante "curto" = uma nota só, mais discreta (ex: copiar e-mail)
    function tocarSom(variante = "notificacao") {
        try {
            const AudioContextClasse = window.AudioContext || window.webkitAudioContext;
            if (!AudioContextClasse) return;
 
            const ctx = new AudioContextClasse();
            if (ctx.state === "suspended") ctx.resume();
 
            const tocarTom = (freq, inicio, duracao, volume = 0.15) => {
                const osc = ctx.createOscillator();
                const gain = ctx.createGain();
                osc.type = "sine";
                osc.frequency.value = freq;
                gain.gain.setValueAtTime(0, ctx.currentTime + inicio);
                gain.gain.linearRampToValueAtTime(volume, ctx.currentTime + inicio + 0.02);
                gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + inicio + duracao);
                osc.connect(gain);
                gain.connect(ctx.destination);
                osc.start(ctx.currentTime + inicio);
                osc.stop(ctx.currentTime + inicio + duracao + 0.05);
            };
 
            if (variante === "curto") {
                tocarTom(1046, 0, 0.10, 0.12);
            } else {
                tocarTom(880, 0, 0.12);
                tocarTom(1175, 0.09, 0.18);
            }
        } catch (err) {
            console.warn("Não foi possível tocar o som:", err);
        }
    }
 
    // ================= TOAST DE NOTIFICAÇÃO NOVA =================
    function mostrarToastNotificacao(notificacao) {
        let toast = document.getElementById("toast-notificacao");
 
        if (!toast) {
            toast = document.createElement("div");
            toast.id = "toast-notificacao";
            toast.className = "toast-notificacao";
            toast.innerHTML = `
                <div class="toast-notificacao-icone">
                    <i class="bi ${iconePorTipo(notificacao.tipo)}"></i>
                </div>
                <div class="toast-notificacao-corpo">
                    <p class="toast-notificacao-titulo"></p>
                    <p class="toast-notificacao-desc"></p>
                </div>
                <button type="button" class="toast-notificacao-fechar" aria-label="Fechar">&times;</button>
            `;
            document.body.appendChild(toast);
 
            toast.querySelector(".toast-notificacao-fechar").addEventListener("click", () => {
                toast.classList.remove("show");
            });
        }
 
        toast.querySelector(".toast-notificacao-icone i").className = `bi ${iconePorTipo(notificacao.tipo)}`;
        toast.querySelector(".toast-notificacao-titulo").textContent = notificacao.titulo;
        toast.querySelector(".toast-notificacao-desc").textContent = notificacao.descricao;
 
        tocarSom("notificacao");
 
        // força reflow para reiniciar a transição caso já esteja visível
        toast.classList.remove("show");
        void toast.offsetWidth;
        toast.classList.add("show");
 
        clearTimeout(toast._timeoutId);
        toast._timeoutId = setTimeout(() => {
            toast.classList.remove("show");
        }, 5000);
    }
 
    // ================= EXPÕE A API =================
    window.NotificacoesVizin = {
        pronto,
        carregar,
        obterTodas,
        marcarComoLida,
        marcarTodasComoLidas,
        excluir,
        contarNaoLidas,
        iconePorTipo,
        mostrarToastNotificacao,
        tocarSom,
        usuarioAtual,          // compatibilidade (e-mail); prefira ids
        carregarPreferencias,
        obterPreferencias,
        salvarPreferencias,
        PREFERENCIAS_PADRAO
    };

    // Atalho global simples, pra scripts de outras páginas (ex: script.js da
    // home, no efeito de copiar e-mail) chamarem sem precisar saber do
    // objeto NotificacoesVizin.
    window.tocarSomVizin = tocarSom;

})();
