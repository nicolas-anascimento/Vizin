/* =====================================================
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
                tipo: "aluguel_confirmado",
                titulo: "Aluguel Confirmado",
                descricao: "Seu aluguel da Câmera DSLR Canon EOS foi confirmado!",
                data: "14/03/2026",
                lida: false
            },
            {
                id: 2,
                tipo: "avaliacao",
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
 
    // usuarioId aqui é o DESTINATÁRIO da notificação — por padrão o próprio
    // usuário logado (self-notify, como a simulação lá embaixo), mas
    // páginas como produto.js e app.js (Mensagens) podem passar o id de
    // OUTRA pessoa (ex: o dono do objeto, ou quem recebeu a mensagem)
    // como segundo argumento.
    function adicionarNotificacao(notificacao, usuarioId = usuarioAtual()) {
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
            case "mensagem": return "bi-chat-dots-fill";
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
    // Todas as OUTRAS notificações alimentam a badge do sino — assim os dois
    // contadores não somam a mesma coisa duas vezes.
    function atualizarBadge() {
        const headerEl = document.getElementById("header");
        if (!headerEl) return;
 
        aplicarBadgeNoIcone(headerEl, "i.bi-bell", "notificacoes.html", n => n.tipo !== "mensagem");
        aplicarBadgeNoIcone(headerEl, "i.bi-chat-dots", "../Mensagens/index.html", n => n.tipo === "mensagem");
    }
 
    function aplicarBadgeNoIcone(headerEl, seletorIcone, hrefPadrao, filtroTipo) {
        const icone = headerEl.querySelector(seletorIcone);
        if (!icone) return;
 
        const link = icone.closest("a");
        if (!link) return;
 
        // Reaproveita o mesmo estilo visual de badge já usado no sino —
        // não precisa de nenhuma classe/CSS novo.
        link.classList.add("link-notificacoes");
 
        if (link.getAttribute("href") === "#" || !link.getAttribute("href")) {
            link.setAttribute("href", hrefPadrao);
        }
 
        const total = obterTodas().filter(n => !n.lida && filtroTipo(n)).length;
        if (total > 0) {
            link.dataset.badgeCount = total > 9 ? "9+" : String(total);
        } else {
            delete link.dataset.badgeCount;
        }
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
    // Só simula em página carregada com o usuário logado.
    if (localStorage.getItem("token")) {
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
        usuarioAtual   // exposto pra debug/testes no console
    };
 
    // Atalho global simples, pra scripts de outras páginas (ex: script.js da
    // home, no efeito de copiar e-mail) chamarem sem precisar saber do
    // objeto NotificacoesVizin.
    window.tocarSomVizin = tocarSom;
 
})();
 