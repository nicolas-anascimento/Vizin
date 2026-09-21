/**
 * admin-frame.js
 * ------------------------------------------------------------------
 * Equivalente ao frame.js do site do usuário, só que para o painel
 * admin:
 *   1) injeta a sidebar (admin-sidebar/index.html) dentro de
 *      #adminSidebarContainer e marca o item ativo usando o
 *      atributo data-page da <body> de cada página
 *      (ex: <body class="admin-body" data-page="usuarios">);
 *   2) preenche nome/iniciais do admin logado na sidebar;
 *   3) garante que existe um <div id="toast"> na página e expõe
 *      window.mostrarToastAdmin(mensagem, tipo), pra qualquer
 *      script do admin (usuarios.js, admin-usuario-acoes.js etc.)
 *      poder mostrar avisos sem precisar declarar essa div sozinho
 *      (se a página já tiver a div, essa função reaproveita ela).
 *
 * CORRIGIDO: o fetch apontava para "../Admin-Sidebar/index.html"
 * (maiúsculo), mas a pasta real é "admin-sidebar" (minúsculo, é o
 * mesmo nome usado no <link> do CSS) — em servidor Linux isso
 * quebraria por diferença de maiúsculas/minúsculas.
 *
 * Não reaproveita o frame.js do usuário porque ele já busca
 * ../header/index.html e ../footer/index.html — se fosse incluído
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

    // ================= SIDEBAR =================
    const container = document.getElementById("adminSidebarContainer");
    if (!container) return;

    fetch("../admin-sidebar/index.html")
        .then(r => {
            if (!r.ok) throw new Error(`Erro ${r.status} ao buscar admin-sidebar/index.html`);
            return r.text();
        })
        .then(html => {
            container.innerHTML = html;
            marcarLinkAtivo();
            preencherPerfilAdmin();
            ligarLogout();
        })
        .catch(err => console.error("Falha ao carregar sidebar do admin:", err));

    // ================= ITEM ATIVO =================
    // Compara com body[data-page]. TODO: se o admin passar a ter
    // páginas geradas dinamicamente (ex: edição de item por id),
    // reforçar esse data-page manualmente no <body> daquela página.
    function marcarLinkAtivo() {
        const paginaAtual = document.body.dataset.page;
        if (!paginaAtual) return;

        document.querySelectorAll(".admin-nav-link[data-page]").forEach(link => {
            link.classList.toggle("active", link.dataset.page === paginaAtual);
        });
    }

    // ================= PERFIL DO ADMIN LOGADO =================
    // Usa o mesmo localStorage("usuario") que login.js salva no login.
    // Se não houver ninguém logado (ou faltar o nome), mantém o
    // placeholder que já vem no HTML da sidebar.
    async function preencherPerfilAdmin() {
        const token = localStorage.getItem("token");
        let usuario;
        try {
            let resposta = await fetch("/api/login/sessao", {
                credentials: "same-origin", headers: token ? { Authorization: `Bearer ${token}` } : {}
            });
            if (resposta.status === 401 && token) {
                localStorage.removeItem("token");
                resposta = await fetch("/api/login/sessao", { credentials: "same-origin" });
            }
            if (!resposta.ok) throw new Error("Sessão indisponível");
            usuario = await resposta.json();
            if (usuario.tipo !== "admin") {
                window.location.href = "/inicio";
                return;
            }
            const { id, nome, email, tipo, avatarUrl, verificado } = usuario;
            localStorage.setItem("usuario", JSON.stringify({ id, nome, email, tipo, avatarUrl, verificado }));
        } catch {
            window.location.href = "/login";
            return;
        }
        if (!usuario || !usuario.nome) return;

        const nomeEl = document.getElementById("adminSidebarNome");
        const avatarEl = document.getElementById("adminSidebarAvatar");

        if (nomeEl) nomeEl.textContent = usuario.nome;

        if (avatarEl) {
            const iniciais = usuario.nome
                .split(" ")
                .filter(Boolean)
                .slice(0, 2)
                .map(parte => parte[0].toUpperCase())
                .join("");
            avatarEl.textContent = iniciais;
        }
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

})();
