/* ===================================================
   INCLUIR ESSE SCRIPT EM TODAS AS PÁGINAS QUE CARREGAM O HEADER
   (depois de config.js, api-client.js, frame.js e logout.js), pois é ele quem:
   - Mantém o número de notificações não lidas em cima do sino do menu
   - Mantém o número de mensagens não lidas em cima do ícone de Mensagens
   - Mostra o toast quando chega uma notificação nova (clicável: leva pra página certa)
   - Expõe window.NotificacoesVizin, usado pela página notificacoes.js

   API REAL: quem GERA as notificações é o back-end (solicitação, aprovação,
   cancelamento, retirada/devolução, lembretes, atraso, avaliação, multa,
   mensagem, problema reportado). O front só lista, marca como lida e exclui.
   Ids são UUID (string) — nunca converter com Number().

   Rotas: GET /notificacoes?limit=100 · PATCH /notificacoes/:id {lida:true} ·
          DELETE /notificacoes/:id · PATCH /notificacoes/ler-todas ·
          GET|PUT /usuarios/preferencias-notificacao
   Socket.IO antecipa novas notificações; polling a cada 20 s permanece como fallback.
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

    // ================= RESSINCRONIZAR SolicitacoesVizin =================
    // notificacoes-shared.js recebe eventos em tempo real (Socket.IO) e faz
    // polling a cada 20s; solicitacoes-shared.js só faz polling a cada 30s,
    // sem socket. Resultado: quando chega uma notificação tipo
    // "solicitacao_aluguel" (ou qualquer evento que muda o status de uma
    // solicitação), a página de Notificações pode renderizar o card ANTES do
    // cache de SolicitacoesVizin ter sido atualizado — ex.: criarCard() em
    // notificacoes.js decide se mostra "Ver solicitação" checando
    // SolicitacoesVizin.obterPorId(...).status === "pendente", e por até 30s
    // essa leitura pode estar desatualizada ou vir null.
    // Em vez de esperar o back expor um socket também pras solicitações,
    // forçamos um refresh imediato do SolicitacoesVizin sempre que chega uma
    // notificação de um tipo que reflete mudança de status de solicitação.
    const TIPOS_QUE_AFETAM_SOLICITACAO = new Set([
        "solicitacao_aluguel", "aluguel_aprovado", "aluguel_rejeitado", "aluguel_cancelado",
        "retirada_confirmada", "retirada_atrasada", "devolucao_confirmada",
        "pagamento_liberado", "multa_paga", "problema_reportado"
    ]);

    function ressincronizarSolicitacoesSeNecessario(notificacoes) {
        if (!window.SolicitacoesVizin) return;
        const precisa = notificacoes.some(n => TIPOS_QUE_AFETAM_SOLICITACAO.has(n.tipo));
        if (precisa) window.SolicitacoesVizin.atualizar().catch(() => {});
    }

    // ================= CARGA (polling) =================
    async function carregar() {
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
                if (chegaram.length > 0) {
                    mostrarToastNotificacao(chegaram[0]);
                    ressincronizarSolicitacoesSeNecessario(chegaram);
                }
            } finally {
                carregando = null;
            }
        })();

        return carregando;
    }

    const pronto = carregar().catch(err => console.error("Não foi possível carregar as notificações:", err));

    // Socket.IO antecipa a atualização; o polling continua como fallback e reconciliação.
    window.addEventListener("vizin:notification", (event) => {
        const recebida = normalizar(event.detail || {});
        if (!recebida.id || cache.some(n => n.id === recebida.id)) return;
        cache.unshift(recebida);
        if (!recebida.lida) totalNaoLidasServidor += 1;
        primeiraCargaFeita = true;
        avisarMudanca();
        mostrarToastNotificacao(recebida);
        ressincronizarSolicitacoesSeNecessario([recebida]);
    });

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
    let preferenciasCache = null;

    async function carregarPreferencias() {
        const dados = await Api.get("/usuarios/preferencias-notificacao");
        const preferencias = dados?.preferencias || dados;
        if (!preferencias || typeof preferencias !== "object" || Array.isArray(preferencias)) {
            throw new Error("Resposta de preferências inválida");
        }
        preferenciasCache = { ...preferencias };
        return { ...preferenciasCache };
    }

    function obterPreferencias() {
        return preferenciasCache ? { ...preferenciasCache } : null;
    }

    async function salvarPreferencias(prefs) {
        const dados = await Api.put("/usuarios/preferencias-notificacao", prefs);
        const preferencias = dados?.preferencias || dados;
        if (!preferencias || typeof preferencias !== "object" || Array.isArray(preferencias)) {
            throw new Error("Resposta de preferências inválida");
        }
        preferenciasCache = { ...preferencias };
        return { ...preferenciasCache };
    }

    // ================= ÍCONE POR TIPO =================
    function iconePorTipo(tipo) {
        switch (tipo) {
            case "lembrete": return "bi-bell";
            case "solicitacao_aluguel": return "bi-inbox";
            case "aluguel_aprovado": return "bi-check-lg";
            case "aluguel_rejeitado": return "bi-x-lg";
            case "retirada_confirmada": return "bi-camera-fill";
            case "retirada_atrasada": return "bi-exclamation-triangle-fill";
            case "devolucao_confirmada": return "bi-arrow-counterclockwise";
            case "pagamento_liberado": return "bi-cash-coin";
            case "avaliacao_recebida": return "bi-star-fill";
            case "aluguel_cancelado": return "bi-x-circle";
            case "mensagem": return "bi-chat-dots-fill";
            case "resposta_email": return "bi-envelope-check-fill";
            case "bloqueio_conta": return "bi-slash-circle";
            case "conta_reativada": return "bi-check-circle-fill";
            case "verificacao_aprovada": return "bi-patch-check-fill";
            case "verificacao_reprovada": return "bi-patch-exclamation-fill";
            // O admin tirou o selo de uma conta que já estava verificada.
            case "verificacao_revogada": return "bi-patch-minus-fill";
            case "problema_reportado": return "bi-flag-fill";
            case "multa_paga": return "bi-receipt";
            case "dados_atualizados_admin": return "bi-pencil-square";
            // Comunicado em massa enviado pela Central de Notificações do admin.
            // Sem destino (obterDestino cai em null): mostra só "Marcar como lida".
            case "comunicado_admin": return "bi-megaphone-fill";
            // Desfecho de um chamado do Suporte/denúncia (resolvida, fechada ou
            // improcedente). A resposta escrita pelo atendente usa "resposta_email".
            case "ocorrencia_atualizada": return "bi-clipboard-check";
            case "anuncio_removido_admin": return "bi-x-octagon-fill";
            // Ainda não existe no back (ver mensagem sobre isso) — preparado
            // aqui pra quando o admin passar a notificar também a OCULTAÇÃO
            // (não só o arquivamento) de um anúncio.
            case "anuncio_ocultado_admin": return "bi-eye-slash-fill";
            // Moderação de avaliação pelo admin — "ocultada" (reversível) e
            // "removida" (permanente), tanto pra quem ESCREVEU a avaliação
            // quanto pra quem foi AVALIADO por ela (a nota dele muda).
            // Nenhum dos quatro existe no back ainda (ver mensagem sobre isso).
            case "avaliacao_ocultada_admin": return "bi-eye-slash-fill";
            case "avaliacao_removida_admin": return "bi-x-octagon-fill";
            case "avaliacao_sobre_voce_ocultada_admin": return "bi-eye-slash-fill";
            case "avaliacao_sobre_voce_removida_admin": return "bi-x-octagon-fill";
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
 
    // ================= DESTINO (DEEP LINK) POR TIPO =================
    // Fonte única de "pra onde essa notificação leva": usada pelo toast
    // (abaixo) e pelo "Ver detalhes" da página de Notificações
    // (notificacoes.js), pra os dois nunca divergirem.
    //
    // Retorna a URL, ou null quando não há destino (ex.: "resposta_email"
    // não carrega nenhum id, ou item antigo sem solicitacaoId).
    const DESTINO_EM_ANDAMENTO = (id) => `/status-locacao?solicitacaoId=${enc(id)}`;
    const DESTINO_HISTORICO = () => "/historico";

    const TIPOS_EM_ANDAMENTO = new Set(["aluguel_aprovado", "retirada_confirmada", "retirada_atrasada", "lembrete", "problema_reportado"]);
    // multa_paga ficava de fora de qualquer mapa: tinha
    // ícone e cor (notificacoes.css/iconePorTipo) mas obterDestino() caía no
    // "null" e a notificação só mostrava "Marcar como lida", sem link nenhum
    // pro Histórico — diferente de pagamento_liberado, que é do mesmo
    // universo (financeiro/pós-locação) e sempre teve destino.
    const TIPOS_HISTORICO = new Set(["aluguel_rejeitado", "aluguel_cancelado", "devolucao_confirmada", "pagamento_liberado", "multa_paga"]);

    // Pra quem ESCREVEU a avaliação que o admin ocultou/removeu: manda pro
    // Histórico (é onde está o aluguel ao qual a avaliação se referia).
    const TIPOS_AVALIACAO_PROPRIA_MODERADA = new Set(["avaliacao_ocultada_admin", "avaliacao_removida_admin"]);

    // Notificações de conta/administrativas: não dependem de solicitacaoId.
    const TIPOS_CONTA = new Map([
        ["bloqueio_conta", () => "/perfil"],
        ["conta_reativada", () => "/perfil"],
        // O card "Verifique sua conta" (perfil.js) já mostra o motivo da reprovação e o botão pra tentar de novo.
        ["verificacao_aprovada", () => "/perfil"],
        ["verificacao_reprovada", () => "/perfil"],
        ["verificacao_revogada", () => "/perfil"],
        ["dados_atualizados_admin", () => "/perfil"],
        ["anuncio_removido_admin", () => "/meus-objetos"],
        // Ver comentário em iconePorTipo — pronto pro back começar a mandar.
        ["anuncio_ocultado_admin", () => "/meus-objetos"],
        // Respostas e desfechos do Suporte: levam pra "Meus chamados", onde
        // ficam a resposta do atendente e o motivo (ex.: denúncia improcedente).
        // ATENÇÃO: confirme que "/suporte" é a rota da página de Suporte.
        ["resposta_email", () => "/suporte#meus-chamados-titulo"],
        ["ocorrencia_atualizada", () => "/suporte#meus-chamados-titulo"]
    ]);

    // "avaliacao_recebida" não tem UM destino fixo: se eu era o proprietário
    // da locação, a avaliação é sobre o OBJETO (página de Produto); se eu era
    // o locatário, é sobre MIM (meu Perfil). Precisa do cache de solicitações;
    // em páginas que não carregam solicitacoes-shared.js cai no Histórico.
    function obterDestinoAvaliacao(notificacao) {
        const Solicitacoes = window.SolicitacoesVizin;
        if (!notificacao.solicitacaoId || !Solicitacoes) return DESTINO_HISTORICO();

        const solicitacao = Solicitacoes.obterPorId(notificacao.solicitacaoId);
        if (!solicitacao) return DESTINO_HISTORICO();

        return solicitacao.souProprietario
            ? `/produto?id=${solicitacao.produtoId}#avaliacoes`
            : `/perfil#avaliacoes-secao`;
    }

    function obterDestino(notificacao) {
        // "sobre_voce" usa a MESMA regra de destino de avaliacao_recebida
        // (produto se eu era proprietário, meu perfil se eu era locatário)
        // porque é a mesma avaliação — só que agora ela sumiu/ficou oculta,
        // e a pessoa quer ver a nota que mudou.
        if (notificacao.tipo === "avaliacao_recebida"
            || notificacao.tipo === "avaliacao_sobre_voce_ocultada_admin"
            || notificacao.tipo === "avaliacao_sobre_voce_removida_admin") {
            return obterDestinoAvaliacao(notificacao);
        }
        if (TIPOS_AVALIACAO_PROPRIA_MODERADA.has(notificacao.tipo)) return DESTINO_HISTORICO();
        if (TIPOS_CONTA.has(notificacao.tipo)) return TIPOS_CONTA.get(notificacao.tipo)();

        if (TIPOS_EM_ANDAMENTO.has(notificacao.tipo)) {
            return notificacao.solicitacaoId ? DESTINO_EM_ANDAMENTO(notificacao.solicitacaoId) : null;
        }
        if (TIPOS_HISTORICO.has(notificacao.tipo)) return DESTINO_HISTORICO();

        if (notificacao.tipo === "mensagem") {
            // Com conversaId, a página de Mensagens abre direto a conversa.
            return notificacao.conversaId
                ? `/mensagens?conversaId=${enc(notificacao.conversaId)}`
                : "/mensagens";
        }
        return null;
    }

    // Só o toast: uma solicitação nova leva pra aba Solicitações do Histórico
    // (é onde o proprietário aprova/recusa). Na página de Notificações esse
    // tipo tem tratamento próprio, por isso não entra em obterDestino().
    function obterDestinoDoToast(notificacao) {
        if (notificacao.tipo === "solicitacao_aluguel") return "/historico?tab=solicitacoes";
        return obterDestino(notificacao);
    }

    // ================= TOAST DE NOTIFICAÇÃO NOVA =================
    async function abrirDestinoDoToast(toast) {
        const notificacao = toast._notificacao;
        const destino = toast._destino;
        if (!notificacao || !destino) return;

        toast.classList.remove("show");
        clearTimeout(toast._timeoutId);

        // Abrir a notificação já a marca como lida (limpa o badge). Espera um
        // pouco pelo PATCH pra ele não ser cancelado pela navegação, mas sem
        // travar o clique se a rede estiver lenta.
        if (!notificacao.lida) {
            await Promise.race([
                marcarComoLida(notificacao.id),
                new Promise(resolve => setTimeout(resolve, 400))
            ]);
        }

        window.location.href = destino;
    }

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
 
            toast.querySelector(".toast-notificacao-fechar").addEventListener("click", (e) => {
                e.stopPropagation(); // fechar não pode disparar a navegação
                toast.classList.remove("show");
            });

            // Clicar no toast leva pra página da notificação.
            toast.addEventListener("click", () => abrirDestinoDoToast(toast));
            toast.addEventListener("keydown", (e) => {
                if (e.target !== toast) return;
                if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    abrirDestinoDoToast(toast);
                }
            });
        }
 
        toast.querySelector(".toast-notificacao-icone i").className = `bi ${iconePorTipo(notificacao.tipo)}`;
        toast.querySelector(".toast-notificacao-titulo").textContent = notificacao.titulo;
        toast.querySelector(".toast-notificacao-desc").textContent = notificacao.descricao;

        // Guarda pra onde o clique leva (null = toast só informativo).
        toast._notificacao = notificacao;
        toast._destino = obterDestinoDoToast(notificacao);
        toast.classList.toggle("clicavel", !!toast._destino);
        if (toast._destino) {
            toast.setAttribute("role", "link");
            toast.tabIndex = 0;
        } else {
            toast.removeAttribute("role");
            toast.removeAttribute("tabindex");
        }
 
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
        obterDestino,
        tocarSom,
        carregarPreferencias,
        obterPreferencias,
        salvarPreferencias
    };

    // Atalho global simples, pra scripts de outras páginas (ex: script.js da
    // home, no efeito de copiar e-mail) chamarem sem precisar saber do
    // objeto NotificacoesVizin.
    window.tocarSomVizin = tocarSom;

})();