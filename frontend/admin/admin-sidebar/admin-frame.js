/**
 * admin-frame.js
 * ------------------------------------------------------------------
 * Equivalente ao frame.js do site do usuário, só que para o painel
 * admin:
 *   1) injeta a sidebar servida em /partials/admin-sidebar dentro de
 *      #adminSidebarContainer e marca o item ativo usando o
 *      atributo data-page da <body> de cada página
 *      (ex: <body class="admin-body" data-page="usuarios">);
 *   2) preenche nome/iniciais do admin logado na sidebar;
 *   3) garante que existe um <div id="toast"> na página e expõe
 *      window.mostrarToastAdmin(mensagem, tipo), pra qualquer
 *      script do admin (usuarios.js, admin-usuario-acoes.js etc.)
 *      poder mostrar avisos sem precisar declarar essa div sozinho
 *      (se a página já tiver a div, essa função reaproveita ela);
 *   4) mostra contadores (bolinha laranja) nos links do menu que têm
 *      algo esperando o admin — ver "CONTADORES NA SIDEBAR" abaixo.
 *
 * Não reaproveita o frame.js do usuário porque ele busca os fragmentos
 * de header e footer — se fosse incluído
 * aqui também, tentaria injetar esses elementos em páginas do admin
 * que não têm #header/#footer.
 * ------------------------------------------------------------------
 */

(function () {

    // ================= TOAST (disponível em toda página do admin) =================
    function garantirElementoToastAdmin() {
        let toast = document.getElementById("toast");
        if (!toast) {
            toast = document.createElement("div");
            toast.id = "toast";
            toast.className = "admin-toast";
            document.body.appendChild(toast);
        }
        return toast;
    }

    window.mostrarToastAdmin = function (mensagem, tipo = "sucesso") {
        const toast = garantirElementoToastAdmin();
        toast.innerText = mensagem;
        toast.className = `admin-toast show ${tipo}`;

        setTimeout(() => {
            toast.classList.remove("show");
        }, 2500);
    };

    garantirElementoToastAdmin();

    // ================= AVATAR (foto ou iniciais) =================
    // Devolve o HTML interno de um avatar: <img> quando há foto válida
    // (http/https ou caminho relativo); se a imagem falhar ao carregar,
    // volta para as iniciais. `iniciais` deve ser texto simples.
    function escAttr(t) {
        return String(t).replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    }
    function urlAvatarSegura(url) {
        if (typeof url !== "string") return "";
        const u = url.trim();
        return /^(https?:\/\/|\/(?!\/))/i.test(u) ? u : "";
    }
    window.avatarAdminHtml = function (avatarUrl, iniciais) {
        const ini = String(iniciais ?? "?");
        const url = urlAvatarSegura(avatarUrl);
        if (!url) return escAttr(ini);
        return `<img src="${escAttr(url)}" alt="" data-ini="${escAttr(ini)}" onerror="this.replaceWith(document.createTextNode(this.dataset.ini))">`;
    };

    function iniciaisDoNome(nome) {
        return String(nome ?? "").split(" ").filter(Boolean).slice(0, 2)
            .map(parte => parte[0].toUpperCase()).join("") || "?";
    }

    // ================= SIDEBAR: nome, foto e item ativo =================
    function pintarSidebar(nome, avatarUrl) {
        const nomeEl = document.getElementById("adminSidebarNome");
        const avatarEl = document.getElementById("adminSidebarAvatar");
        if (nomeEl) nomeEl.textContent = nome || "Administrador";
        if (avatarEl) avatarEl.innerHTML = window.avatarAdminHtml(avatarUrl, iniciaisDoNome(nome));
    }

    function marcarItemAtivo() {
        const pagina = document.body.dataset.page;
        if (!pagina) return;
        document.querySelectorAll(".admin-nav-link").forEach(link => {
            link.classList.toggle("active", link.dataset.page === pagina);
        });
    }

    function lerUsuarioSalvo() {
        try { return JSON.parse(localStorage.getItem("usuario") || "null"); }
        catch { return null; }
    }

    // Mesma estratégia do frame.js do site: Bearer legado primeiro; se vier 401,
    // tenta de novo só com o cookie de sessão.
    async function buscarSessaoAdmin() {
        const token = localStorage.getItem("token");
        try {
            let resposta = await fetch("/api/login/sessao", {
                credentials: "same-origin",
                headers: token ? { Authorization: `Bearer ${token}` } : {}
            });
            if (resposta.status === 401 && token) {
                localStorage.removeItem("token");
                resposta = await fetch("/api/login/sessao", { credentials: "same-origin" });
            }
            return resposta.ok ? await resposta.json() : null;
        } catch {
            return null;
        }
    }

    async function carregarSidebar() {
        const container = document.getElementById("adminSidebarContainer");
        if (!container) return;

        try {
            const resposta = await fetch("/partials/admin-sidebar", { credentials: "same-origin" });
            if (!resposta.ok) throw new Error(`Erro ${resposta.status} ao buscar a sidebar`);
            container.innerHTML = await resposta.text();
        } catch (erro) {
            console.error("Falha ao carregar a sidebar do admin:", erro);
            return;
        }

        marcarItemAtivo();

        // Nome/foto: usa o cache local na hora e confirma com o servidor em seguida
        // (é a sessão que traz a foto atual do admin).
        const salvo = lerUsuarioSalvo();
        if (salvo) pintarSidebar(salvo.nome, salvo.avatarUrl);

        const usuario = await buscarSessaoAdmin();
        if (usuario) {
            pintarSidebar(usuario.nome, usuario.avatarUrl);
            const { id, nome, email, tipo, avatarUrl, verificado } = usuario;
            try { localStorage.setItem("usuario", JSON.stringify({ id, nome, email, tipo, avatarUrl, verificado })); } catch { /* sem cache local */ }
        }

        iniciarContadores(); // os links já existem no DOM
    }

    // ================= LOGOUT =================
    // Login agora fica em usuario/Login (não mais um nível acima do
    // admin) — daqui de dentro de admin/<pagina>/ são 2 níveis pra
    // cima, depois entrar em usuario/Login/.
    function ligarLogout() {
        document.addEventListener("click", async (e) => {
            const btn = e.target.closest(".js-admin-logout");
            if (!btn) return;

            e.preventDefault();

            const token = localStorage.getItem("token");
            btn.disabled = true;
            try {
                let resposta = await fetch("/api/login/logout", {
                    method: "POST", credentials: "same-origin",
                    headers: token ? { Authorization: `Bearer ${token}` } : {}
                });
                if (resposta.status === 401 && token) {
                    localStorage.removeItem("token");
                    resposta = await fetch("/api/login/logout", { method: "POST", credentials: "same-origin" });
                }
                if (!resposta.ok && resposta.status !== 401) throw new Error("Não foi possível encerrar a sessão.");
                localStorage.removeItem("token");
                localStorage.removeItem("usuario");
            } catch (erro) {
                btn.disabled = false;
                window.mostrarToastAdmin(erro.message, "erro");
                return;
            }

            window.location.href = "/login";
        });
    }

    // ================= GAVETA NO MOBILE =================
    function ligarGavetaMobile() {
        document.addEventListener("click", (e) => {
            if (e.target.closest("#adminMenuToggle")) {
                document.body.classList.toggle("admin-sidebar-aberta");
                return;
            }

            // Fecha ao clicar fora (overlay) ou num link do menu
            if (e.target.closest("#adminSidebarOverlay") || e.target.closest(".admin-nav-link")) {
                document.body.classList.remove("admin-sidebar-aberta");
            }
        });
    }

    // ================= CONTADORES NA SIDEBAR =================
    // Cada link do menu pode mostrar uma bolinha com "quanto tem esperando
    // o admin". Duas famílias de contagem:
    //
    //  - FILAS de trabalho (somem só quando o admin resolve o caso):
    //      Denúncias / Suporte -> total_pendentes (GET /admin/ocorrencias/resumo)
    //      Verificações        -> verificações em análise (GET /admin/verificacoes?status=pendente, campo `total`)
    //
    //  - NOTIFICAÇÕES NÃO LIDAS por categoria (somem quando o admin lê na
    //    tela de Notificações; GET /admin/notificacoes/resumo):
    //      Usuários  -> novos cadastros / usuários reincidentes
    //      Anúncios  -> novos anúncios publicados / anúncios reportados
    //      Pagamentos-> pagamentos processados / falhos / estornados
    //      Avaliações-> avaliações negativas
    //      Notificações (recebidas) -> total de não lidas
    //
    // Sem contador de propósito: Categorias, Configurações e Criar Notificação
    // (não há "pendência" ali). Pra um link novo ganhar contador, basta
    // adicionar uma linha em CONTADORES com o data-page dele.
    //
    // Falha de rede/rota inexistente não quebra nada: o contador só fica
    // escondido (ou mantém o último valor conhecido).
    const INTERVALO_CONTADORES_MS = 60000;

    const fontes = { notificacoes: null, ocorrencias: null, verificacoes: null };

    const numero = v => {
        const n = Number(v);
        return Number.isFinite(n) && n > 0 ? Math.floor(n) : 0;
    };
    const porCategoria = (f, cat) => numero(f.notificacoes?.por_categoria?.[cat]);

    // data-page do link -> função que devolve o número a exibir
    const CONTADORES = {
        "usuarios":               f => porCategoria(f, "usuarios"),
        "anuncios":               f => porCategoria(f, "anuncios"),
        "pagamentos":             f => porCategoria(f, "pagamentos"),
        "avaliacoes":             f => porCategoria(f, "avaliacoes"),
        "denuncias":              f => numero(f.ocorrencias?.total_pendentes),
        "verificacoes":           f => numero(f.verificacoes?.total),
        "notificacoes-recebidas": f => numero(f.notificacoes?.nao_lidas)
    };

    const ROTULOS_CONTADOR = {
        "usuarios": "não lidas", "anuncios": "não lidas", "pagamentos": "não lidas",
        "avaliacoes": "não lidas", "notificacoes-recebidas": "não lidas",
        "denuncias": "casos pendentes", "verificacoes": "em análise"
    };

    function definirBadge(link, valor, rotulo) {
        let badge = link.querySelector(".admin-nav-badge");
        if (valor <= 0) {
            if (badge) badge.hidden = true;
            return;
        }
        if (!badge) {
            badge = document.createElement("span");
            badge.className = "admin-nav-badge";
            link.appendChild(badge);
        }
        badge.textContent = valor > 99 ? "99+" : String(valor);
        badge.title = `${valor} ${rotulo}`;
        badge.hidden = false;
    }

    function renderizarContadores() {
        Object.entries(CONTADORES).forEach(([pagina, calcular]) => {
            const link = document.querySelector(`.admin-nav-link[data-page="${pagina}"]`);
            if (link) definirBadge(link, calcular(fontes), ROTULOS_CONTADOR[pagina] || "");
        });
    }

    let _tokenContadores = 0;
    async function buscarContadores() {
        if (typeof apiRequest !== "function") return; // api.js não carregou nesta página
        const meuToken = ++_tokenContadores;

        const [notif, ocor, verif] = await Promise.allSettled([
            apiRequest("/admin/notificacoes/resumo", "GET", null, "Não foi possível carregar as notificações."),
            apiRequest("/admin/ocorrencias/resumo", "GET", null, "Não foi possível carregar o resumo de ocorrências."),
            apiRequest("/admin/verificacoes?status=pendente&page=1&limit=1", "GET", null, "Não foi possível carregar as verificações.")
        ]);
        if (meuToken !== _tokenContadores) return; // chegou uma busca mais nova

        if (notif.status === "fulfilled") fontes.notificacoes = notif.value;
        if (ocor.status === "fulfilled") fontes.ocorrencias = ocor.value;
        if (verif.status === "fulfilled") fontes.verificacoes = verif.value;
        renderizarContadores();
    }

    function iniciarContadores() {
        renderizarContadores();   // usa o que já chegou por evento, se houver
        buscarContadores();

        setInterval(() => { if (!document.hidden) buscarContadores(); }, INTERVALO_CONTADORES_MS);
        document.addEventListener("visibilitychange", () => { if (!document.hidden) buscarContadores(); });
    }

    // A tela de Notificações já tem o resumo em mãos e avisa por evento
    // (evita refazer a requisição e atualiza os contadores na hora).
    document.addEventListener("admin:notificacoes-nao-lidas", (e) => {
        if (e.detail?.resumo) {
            fontes.notificacoes = e.detail.resumo;
            renderizarContadores();
        }
    });

    // Pontos de chamada pras telas depois de uma ação que mexe numa fila
    // (ex.: aprovar uma verificação, resolver uma denúncia).
    window.atualizarBadgesAdmin = buscarContadores;
    window.atualizarBadgeVerificacoes = buscarContadores; // nome que analise.js já usa
    window.atualizarBadgeNotificacoesAdmin = function (total) {
        if (fontes.notificacoes) fontes.notificacoes.nao_lidas = total;
        renderizarContadores();
    };

    // ================= INÍCIO =================
    ligarLogout();
    ligarGavetaMobile();
    carregarSidebar();

})();