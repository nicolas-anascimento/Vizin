/* =====================================================
   INCLUIR ESSE SCRIPT EM TODAS AS PÁGINAS QUE CARREGAM O HEADER
   (depois de frame.js e logout.js), pois é ele quem:
   - Mantém o número de notificações não lidas em cima do sino do menu
   - Mostra o toast quando chega uma notificação nova
   - Expõe window.NotificacoesVizin, usado pela página notificacoes.js
   ===================================================== */
 
(function () {
 
    // Cache em memória da lista de notificações do usuário, alimentado
    // pelo carregarNotificacoes() abaixo e mantido em sincronia a cada
    // ação (marcar como lida, excluir, nova notificação em tempo real).
    let cache = [];
 
    // ================= LEITURA =================
    function obterTodas() {
        return cache;
    }
 
    function contarNaoLidas() {
        return cache.filter(n => !n.lida).length;
    }
 
    function atualizarCache(lista) {
        cache = lista;
        atualizarBadge();
        // Avisa outras partes da página (ex: a própria tela de notificações,
        // se estiver aberta) que a lista mudou, para re-renderizar.
        document.dispatchEvent(new CustomEvent("notificacoesAtualizadas"));
    }
 
    /* ============================================================
       PONTO DE INTEGRAÇÃO COM O BACK-END (leitura)
       GET /api/notificacoes
       Espera-se um retorno JSON: array de notificações no formato
       { id, tipo, titulo, descricao, data, lida }.
       ============================================================ */
    async function carregarNotificacoes() {
        try {
            const response = await fetch("/api/notificacoes", {
                headers: { "Authorization": `Bearer ${localStorage.getItem("token")}` }
            });
 
            if (!response.ok) {
                throw new Error(`Erro ${response.status} ao carregar notificações`);
            }
 
            atualizarCache(await response.json());
        } catch (err) {
            console.error(err);
        }
    }
 
    async function marcarComoLida(id) {
        try {
            /* PONTO DE INTEGRAÇÃO COM O BACK-END: PATCH /api/notificacoes/:id { lida: true } */
            const response = await fetch(`/api/notificacoes/${id}`, {
                method: "PATCH",
                headers: {
                    "Content-Type": "application/json",
                    "Authorization": `Bearer ${localStorage.getItem("token")}`
                },
                body: JSON.stringify({ lida: true })
            });
 
            if (!response.ok) {
                throw new Error(`Erro ${response.status} ao marcar notificação como lida`);
            }
 
            atualizarCache(cache.map(n => n.id === id ? { ...n, lida: true } : n));
        } catch (err) {
            console.error(err);
        }
    }
 
    async function excluir(id) {
        try {
            /* PONTO DE INTEGRAÇÃO COM O BACK-END: DELETE /api/notificacoes/:id */
            const response = await fetch(`/api/notificacoes/${id}`, {
                method: "DELETE",
                headers: { "Authorization": `Bearer ${localStorage.getItem("token")}` }
            });
 
            if (!response.ok) {
                throw new Error(`Erro ${response.status} ao excluir notificação`);
            }
 
            atualizarCache(cache.filter(n => n.id !== id));
        } catch (err) {
            console.error(err);
        }
    }
 
    // Chamada quando uma notificação nova chega em tempo real (ver
    // PONTO DE INTEGRAÇÃO no fim do arquivo, sobre WebSocket/polling).
    function adicionarNotificacao(notificacao) {
        atualizarCache([notificacao, ...cache]);
        return notificacao;
    }
 
    // ================= ÍCONE POR TIPO =================
    function iconePorTipo(tipo) {
        switch (tipo) {
            case "aluguel_confirmado": return "bi-check-lg";
            case "avaliacao": return "bi-star-fill";
            case "lembrete": return "bi-bell";
            default: return "bi-bell";
        }
    }
 
    // ================= BADGE NO SINO DO HEADER =================
    // O header é injetado dinamicamente em #header pelo frame.js. Em vez de
    // reestruturar o HTML (mover o ícone pra dentro de um wrapper) e usar um
    // MutationObserver — que pode entrar em loop se o frame.js também reagir
    // a mudanças no header — aqui só mexemos em ATRIBUTOS (classe e
    // data-attribute) do link já existente, e checamos periodicamente com um
    // setInterval leve. Isso evita qualquer risco de loop infinito.
    function atualizarBadge() {
        const headerEl = document.getElementById("header");
        if (!headerEl) return;
 
        const sino = headerEl.querySelector("i.bi-bell");
        if (!sino) return;
 
        const link = sino.closest("a");
        if (!link) return;
 
        link.classList.add("link-notificacoes");
 
        if (link.getAttribute("href") === "#" || !link.getAttribute("href")) {
            link.setAttribute("href", "notificacoes.html");
        }
 
        const total = contarNaoLidas();
        if (total > 0) {
            link.dataset.badgeCount = total > 9 ? "9+" : String(total);
        } else {
            delete link.dataset.badgeCount;
        }
    }
 
    // Roda assim que possível e depois verifica periodicamente — cobre o
    // caso do header ainda não estar pronto no momento em que este script
    // executa (ele só reflete o cache atual, não busca dados de novo).
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
 
    // ================= CARGA INICIAL =================
    if (localStorage.getItem("token")) {
        carregarNotificacoes();
    }
 
    /* ============================================================
       PONTO DE INTEGRAÇÃO COM O BACK-END (tempo real)
       Ao abrir uma conexão WebSocket (ou fazer polling em
       GET /api/notificacoes), toda vez que uma notificação nova chegar
       para o usuário logado, chamar:
 
         const nova = window.NotificacoesVizin.adicionarNotificacao(notificacaoRecebida);
         window.NotificacoesVizin.mostrarToastNotificacao(nova);
 
       Isso atualiza o badge do sino, a tela de notificações (se estiver
       aberta) e mostra o toast, do mesmo jeito que a carga inicial faz.
       ============================================================ */
 
    // ================= EXPÕE A API PARA A PÁGINA DE NOTIFICAÇÕES =================
    window.NotificacoesVizin = {
        obterTodas,
        marcarComoLida,
        excluir,
        adicionarNotificacao,
        contarNaoLidas,
        iconePorTipo,
        mostrarToastNotificacao,
        tocarSom
    };
 
    // Atalho global simples, pra scripts de outras páginas (ex: script.js da
    // home, no efeito de copiar e-mail) chamarem sem precisar saber do
    // objeto NotificacoesVizin.
    window.tocarSomVizin = tocarSom;
 
})();
 