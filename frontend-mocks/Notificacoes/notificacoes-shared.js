/* ===================================================
   INCLUIR ESSE SCRIPT EM TODAS AS PÁGINAS QUE CARREGAM O HEADER
   (depois de frame.js e logout.js), pois é ele quem:
   - Mantém o número de notificações não lidas em cima do sino do menu
   - Mantém o número de mensagens não lidas em cima do ícone de Mensagens
   - Mostra o toast quando chega uma notificação nova
   - Expõe window.NotificacoesVizin, usado pela página notificacoes.js
   ===================================================== */
 
(function () {
 
    // ================= USUÁRIO ATUAL =================
    // Lê o usuário logado de verdade (salvo pelo Login/script.js em
    // localStorage.usuario, no login).
    // PONTO DE INTEGRAÇÃO COM O BACK-END:
    // No futuro isso deve vir do token (decodificar o JWT ou
    // GET /api/usuarios/me), não do localStorage cru — mas o "email como
    // identificador" pode continuar sendo a chave até existir um id
    // numérico de verdade vindo do banco.
    function usuarioAtual() {
        const usuario = JSON.parse(localStorage.getItem("usuario") || "null");
        return usuario?.email || "convidado";
    }
 
    function chaveStorage(usuarioId) {
        return `notificacoes_${usuarioId}`;
    }
 
    // ================= SEED INICIAL (MOCK) =================
    // PONTO DE INTEGRAÇÃO COM O BACK-END:
    // Troque essa leitura do localStorage por um GET /api/notificacoes
    // (e, futuramente, um WebSocket para receber notificações em tempo real
    // em vez do setTimeout de simulação lá embaixo).
    function seedInicial(usuarioId) {
        const chave = chaveStorage(usuarioId);
        const existente = localStorage.getItem(chave);
        if (existente) return;
 
        const mock = [
            {
                id: 1,
                tipo: "aluguel_aprovado",
                titulo: "Aluguel Confirmado",
                descricao: "Seu aluguel da Câmera DSLR Canon EOS foi confirmado!",
                data: "14/03/2026",
                lida: false
            },
            {
                id: 2,
                tipo: "avaliacao_recebida",
                titulo: "Nova Avaliação",
                descricao: "Maria Santos deixou uma avaliação para você.",
                data: "13/03/2026",
                lida: false
            },
            {
                id: 3,
                tipo: "lembrete",
                titulo: "Lembrete de Devolução",
                descricao: "Não esqueça de devolver a Câmera DSLR amanhã (17/03).",
                data: "12/03/2026",
                lida: true
            }
        ];
 
        localStorage.setItem(chave, JSON.stringify(mock));
    }
 
    seedInicial(usuarioAtual());
 
    // ================= LEITURA / ESCRITA =================
    // Todas essas funções operam sobre o usuário ATUAL por padrão, mas
    // aceitam um usuarioId explícito (usado para notificar OUTRA pessoa,
    // como o dono do objeto quando alguém solicita um aluguel, ou quem
    // recebe uma mensagem no chat).
    function obterTodas(usuarioId = usuarioAtual()) {
        return JSON.parse(localStorage.getItem(chaveStorage(usuarioId)) || "[]");
    }
 
    function salvarTodas(lista, usuarioId = usuarioAtual()) {
        localStorage.setItem(chaveStorage(usuarioId), JSON.stringify(lista));
 
        // Só atualiza badge/dispara evento de re-render se for o usuário
        // logado nesta aba — uma notificação criada para OUTRA pessoa não
        // deve mexer na UI de quem está com a aba aberta agora.
        if (usuarioId === usuarioAtual()) {
            atualizarBadge();
            document.dispatchEvent(new CustomEvent("notificacoesAtualizadas"));
        }
    }
 
    function contarNaoLidas(usuarioId = usuarioAtual()) {
        return obterTodas(usuarioId).filter(n => !n.lida).length;
    }
 
    function marcarComoLida(id, usuarioId = usuarioAtual()) {
        const lista = obterTodas(usuarioId).map(n => n.id === id ? { ...n, lida: true } : n);
        salvarTodas(lista, usuarioId);
    }
 
    function excluir(id, usuarioId = usuarioAtual()) {
        const lista = obterTodas(usuarioId).filter(n => n.id !== id);
        salvarTodas(lista, usuarioId);
    }
 
    // ================= PREFERÊNCIAS DE NOTIFICAÇÃO =================
    // Cada usuário tem as PRÓPRIAS preferências, do mesmo jeito que cada um
    // tem sua própria caixa de notificações (chaveStorage acima). Antes,
    // preferencias.js guardava tudo numa chave única e global no
    // localStorage — o que, além de nunca ser lida por ninguém (essa era a
    // causa dos toggles não funcionarem de fato), também vazaria
    // preferências de uma conta pra outra usada no mesmo navegador.
    function chavePreferencias(usuarioId) {
        return `vizin_notif_prefs_${usuarioId}`;
    }

    // Todos ligados por padrão — a pessoa desliga o que não quiser, em vez
    // de começar tudo desligado e "perder" notificações importantes sem
    // perceber.
    const PREFERENCIAS_PADRAO = {
        solicitacao_recebida: true,
        solicitacao_respondida: true,
        lembretes_aluguel: true,
        avaliacao_recebida: true,
        mensagens: true,
        novidades: false
    };

    function obterPreferencias(usuarioId = usuarioAtual()) {
        const salvas = JSON.parse(localStorage.getItem(chavePreferencias(usuarioId)) || "null");
        return { ...PREFERENCIAS_PADRAO, ...(salvas || {}) };
    }

    function salvarPreferencias(prefs, usuarioId = usuarioAtual()) {
        // PONTO DE INTEGRAÇÃO COM O BACK-END:
        // PUT /api/usuarios/preferencias-notificacao
        localStorage.setItem(chavePreferencias(usuarioId), JSON.stringify(prefs));
    }

    // Mapeia cada TIPO de notificação pra qual preferência controla ele.
    // Tipos que não aparecem aqui (ex: bloqueio_conta, pagamento_liberado,
    // multa_paga, multa_contestada, problema_reportado, retirada_confirmada,
    // devolucao_confirmada, aluguel_cancelado, resposta_email) sempre
    // notificam, com o mesmo critério do toggle "Segurança da conta" (que
    // fica sempre ligado e desabilitado na tela): são avisos sobre dinheiro,
    // restrição de conta ou disputa aberta — a pessoa precisa ver de
    // qualquer jeito, não é uma questão de gosto.
    const TIPO_PARA_PREFERENCIA = {
        solicitacao_aluguel: "solicitacao_recebida",
        aluguel_aprovado: "solicitacao_respondida",
        aluguel_rejeitado: "solicitacao_respondida",
        lembrete: "lembretes_aluguel",
        avaliacao_recebida: "avaliacao_recebida",
        mensagem: "mensagens",
        novidades: "novidades"
    };

    function notificacaoPermitida(tipo, usuarioId) {
        const chavePref = TIPO_PARA_PREFERENCIA[tipo];
        if (!chavePref) return true; // tipo sem toggle correspondente -> sempre permitido
        return !!obterPreferencias(usuarioId)[chavePref];
    }

    // usuarioId aqui é o DESTINATÁRIO da notificação — por padrão o próprio
    // usuário logado (self-notify, como a simulação lá embaixo), mas
    // páginas como produto.js, app.js (Mensagens) e suporte.js podem passar
    // o id de OUTRA pessoa (ex: o dono do objeto, ou quem recebeu a
    // mensagem) como segundo argumento.
    function adicionarNotificacao(notificacao, usuarioId = usuarioAtual()) {
        // Se o DESTINATÁRIO desligou esse tipo de notificação, ela nem
        // chega a ser criada — diferente de só não mostrar o toast, isso
        // também evita que ela apareça depois na lista/badge.
        if (!notificacaoPermitida(notificacao.tipo, usuarioId)) {
            return null;
        }

        const lista = obterTodas(usuarioId);
        const nova = { id: Date.now(), lida: false, ...notificacao };
        lista.unshift(nova);
        salvarTodas(lista, usuarioId);

        // Só mostra o toast/som na hora se o destinatário for quem está
        // usando esta aba agora. Se for outra pessoa, ela só vai ver a
        // notificação quando abrir/atualizar a própria sessão.
        if (usuarioId === usuarioAtual()) {
            mostrarToastNotificacao(nova);
        }

        return nova;
    }
 
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
            default: return "bi-bell";
        }
    }
 
    // ================= BADGES NO MENU (sino + mensagens) =================
    // O header é injetado dinamicamente em #header pelo frame.js. Em vez de
    // reestruturar o HTML (mover os ícones pra dentro de um wrapper) e usar
    // um MutationObserver — que pode entrar em loop se o frame.js também
    // reagir a mudanças no header — aqui só mexemos em ATRIBUTOS (classe e
    // data-attribute) dos links já existentes, e checamos periodicamente com
    // um setInterval leve. Isso evita qualquer risco de loop infinito.
    //
    // Notificações do tipo "mensagem" (criadas em app.js/produto.js quando
    // alguém manda uma mensagem) alimentam a badge do ícone de Mensagens.
    // Todas as OUTRAS notificações (incluindo "resposta_email") alimentam a
    // badge do sino — assim os dois contadores não somam a mesma coisa
    // duas vezes.
    //
    // OBS: existe mais de um ícone de sino/mensagens no header (o do menu
    // desktop .nav-center e o fixo no topo .nav-mobile-top), e o ícone de
    // Mensagens também aparece de novo na .bottom-nav — que fica FORA do
    // #header (é um <nav> separado no body). Por isso aplicarBadgeNoIcone
    // recebe uma lista de "raízes" de busca (não só o header) e usa
    // querySelectorAll em cada uma, aplicando em TODOS os ícones
    // encontrados, não só no primeiro.
    //
    // O tipo "solicitacao_aluguel" NÃO entra na contagem do sino: agora que
    // a decisão de aprovar/recusar mora na aba "Solicitações" do Histórico
    // (ver solicitacoes-shared.js), o número dela aparece só em cima do
    // ícone de Histórico — pra não mostrar duas contagens diferentes
    // avisando da mesma coisa.
    function atualizarBadge() {
        const headerEl = document.getElementById("header");
        const bottomNavEl = document.querySelector(".bottom-nav");
        const raizes = [headerEl, bottomNavEl].filter(Boolean);
        if (!raizes.length) return;
 
        const totalSino = obterTodas().filter(n => !n.lida && n.tipo !== "mensagem" && n.tipo !== "solicitacao_aluguel").length;
        const totalMensagens = obterTodas().filter(n => !n.lida && n.tipo === "mensagem").length;
        const totalSolicitacoesPendentes = window.SolicitacoesVizin
            ? window.SolicitacoesVizin.contarPendentesComoProprietario(usuarioAtual())
            : 0;
 
        aplicarBadgeNoIcone(raizes, "i.bi-bell", "notificacoes.html", totalSino);
        aplicarBadgeNoIcone(raizes, "i.bi-chat-dots", "../Mensagens/index.html", totalMensagens);
        aplicarBadgeNoIcone(raizes, "i.bi-clock-history", "../Historico/index.html?tab=solicitacoes", totalSolicitacoesPendentes);
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
 
    // ================= SIMULAÇÃO DE NOTIFICAÇÃO CHEGANDO (MOCK) =================
    // PONTO DE INTEGRAÇÃO COM O BACK-END:
    // Substituir por um WebSocket (ou polling em GET /api/notificacoes) que,
    // ao detectar uma notificação nova, chame adicionarNotificacao(...) do
    // mesmo jeito que a simulação abaixo faz.
    //
    // TODO: remover este bloco inteiro quando integrar com o back-end real.
    // Como este script roda em toda página que carrega o header, sem
    // nenhuma trava a simulação disparava de novo a cada página aberta por
    // mais de 10s — navegar por 5 páginas gerava 5 notificações idênticas
    // de "Pedro Costa", inflando o badge e atrapalhando testar o resto do
    // fluxo. A chave em sessionStorage garante que ela só dispara UMA vez
    // por aba/sessão do navegador.
    const CHAVE_SIM_MENSAGEM = "vizin_sim_mensagem_disparada";
    if (localStorage.getItem("token") && !sessionStorage.getItem(CHAVE_SIM_MENSAGEM)) {
        sessionStorage.setItem(CHAVE_SIM_MENSAGEM, "1");
        setTimeout(() => {
            adicionarNotificacao({
                tipo: "mensagem",
                titulo: "Nova mensagem",
                descricao: "Pedro Costa enviou uma pergunta sobre a Bicicleta.",
                data: new Date().toLocaleDateString("pt-BR")
            });
        }, 10000); // 10s só para permitir testar o efeito
    }
 
    // ================= EXPÕE A API PARA A PÁGINA DE NOTIFICAÇÕES =================
    window.NotificacoesVizin = {
        obterTodas,
        marcarComoLida,
        excluir,
        adicionarNotificacao,
        contarNaoLidas,
        iconePorTipo,
        mostrarToastNotificacao,
        tocarSom,
        usuarioAtual,   // exposto pra debug/testes no console
        obterPreferencias,
        salvarPreferencias,
        PREFERENCIAS_PADRAO
    };
 
    // Atalho global simples, pra scripts de outras páginas (ex: script.js da
    // home, no efeito de copiar e-mail) chamarem sem precisar saber do
    // objeto NotificacoesVizin.
    window.tocarSomVizin = tocarSom;
 
})();