/* =====================================================
   CONTA SUSPENSA — GUARD GLOBAL (front)
   -----------------------------------------------------
   INCLUIR EM TODAS AS PÁGINAS LOGADAS (menos Login/Cadastro), logo
   DEPOIS de utils/config.js e utils/api-client.js e ANTES dos demais
   módulos compartilhados:

     <script src="/assets/usuario/utils/conta-suspensa.js"></script>

   O que faz quando GET /usuarios/me devolve ativo === false:
     - fora das páginas liberadas (/perfil, /notificacoes, /suporte)
       redireciona pra /perfil;
     - nas páginas liberadas, desativa todos os links do menu/rodapé que
       levam pra outras páginas (visual + bloqueio de clique).

   Também reage ao evento "vizin:conta-suspensa", que o api-client.js
   dispara quando o back responde 403 com codigo "conta_suspensa".

   IMPORTANTE: isso é só experiência de uso. Quem realmente bloqueia é o
   back-end (403 "conta_suspensa" em todas as rotas, exceto a lista de
   liberadas). Sem isso, dá pra burlar pelo console.
   ===================================================== */
(function () {
    "use strict";

    if (!window.ApiVizin) {
        console.error("conta-suspensa.js precisa vir DEPOIS de utils/config.js e utils/api-client.js.");
        return;
    }

    const PAGINAS_LIBERADAS = ["/perfil", "/notificacoes", "/suporte"];
    const PAGINA_DESTINO = "/perfil";

    function normalizarCaminho(caminho) {
        return String(caminho || "/").replace(/\/+$/, "").toLowerCase() || "/";
    }

    function caminhoLiberado(caminho) {
        const c = normalizarCaminho(caminho);
        return PAGINAS_LIBERADAS.some(p => c === p || c.startsWith(p + "/"));
    }

    // Esconde a página enquanto confirma o status — evita "piscar" conteúdo
    // (e disparar telas/ações) de uma página que a conta suspensa não pode ver.
    const estilo = document.createElement("style");
    estilo.textContent = `
        html.verificando-conta body { visibility: hidden; }

        /* Conta suspensa: qualquer link de navegação que não seja Perfil,
           Notificações ou Suporte fica apagado e sem clique. */
        body.conta-suspensa a[href]:not([href^="/perfil"]):not([href^="/notificacoes"]):not([href^="/suporte"]):not([href^="#"]):not(.js-logout) {
            pointer-events: none;
            opacity: .35;
            cursor: not-allowed;
        }
    `;
    document.head.appendChild(estilo);
    document.documentElement.classList.add("verificando-conta");

    let suspensa = false;

    // Rede de segurança pros links injetados depois (header, toasts etc.).
    document.addEventListener("click", (e) => {
        if (!suspensa) return;
        const a = e.target.closest && e.target.closest("a[href]");
        if (!a || a.closest(".js-logout")) return; // sair da conta sempre funciona
        let url;
        try { url = new URL(a.href, window.location.href); } catch (_) { return; }
        if (url.origin !== window.location.origin) return;
        if (url.pathname === window.location.pathname && url.hash) return; // âncora na própria página
        if (!caminhoLiberado(url.pathname)) {
            e.preventDefault();
            e.stopPropagation();
        }
    }, true);

    // Marca a conta como suspensa e aplica o bloqueio de navegação.
    // Chamado tanto pelo /usuarios/me (abaixo) quanto pelo 403 "conta_suspensa"
    // que o api-client avisa em qualquer chamada.
    function aplicarSuspensao() {
        suspensa = true;
        if (!caminhoLiberado(window.location.pathname)) {
            window.location.replace(PAGINA_DESTINO);
            return false; // segue escondido até o redirecionamento
        }
        document.body.classList.add("conta-suspensa");
        return true;
    }

    window.addEventListener("vizin:conta-suspensa", () => {
        if (!suspensa) aplicarSuspensao();
    });

    const pronto = (async () => {
        try {
            const me = await window.ApiVizin.get("/usuarios/me");
            if (me?.ativo === false && !aplicarSuspensao()) return;
        } catch (erro) {
            // Falha de rede/401: não trava a página; o back continua sendo o guardião.
            console.error("Não foi possível verificar o status da conta:", erro);
        }
        document.documentElement.classList.remove("verificando-conta");
    })();

    window.ContaVizin = {
        pronto,
        estaSuspensa: () => suspensa
    };
})();