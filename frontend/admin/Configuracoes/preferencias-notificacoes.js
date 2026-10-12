/**
 * preferencias-notificacoes.js
 * ------------------------------------------------------------------
 * Aba "Notificações" dentro de Configurações do admin. Injeta a aba e o
 * painel sozinho (não precisa mexer no HTML de Configurações), no mesmo
 * padrão dos modais injetados por admin-*-acoes.js.
 *
 * Como usar: acrescentar UMA linha em Configuracoes/index.html, depois de
 * configuracoes.js:
 *   <script src="/assets/admin/Configuracoes/preferencias-notificacoes.js"></script>
 *
 * Rotas (por admin):
 *   GET /admin/notificacoes/preferencias
 *     -> { categorias: { usuarios, anuncios, denuncias, pagamentos, avaliacoes, verificacoes, sistema: boolean },
 *          somente_urgentes: boolean }
 *   PUT /admin/notificacoes/preferencias   (mesmo corpo)
 *
 * Regra (o back aplica na listagem, no /resumo e nos contadores da sidebar):
 *   - categoria desligada  -> não aparece pra este admin;
 *   - somente_urgentes     -> só prioridade 'alta';
 *   - notificação URGENTE de categoria desligada continua aparecendo (segurança).
 *
 * Depende de: window.ApiVizin (utils/api-client.js, já carregado em Configurações).
 * ------------------------------------------------------------------
 */
(function () {
    const menu = document.querySelector(".cfg-menu");
    const conteudo = document.querySelector(".cfg-content");
    if (!menu || !conteudo || !window.ApiVizin) return;

    const CATEGORIAS = [
        { chave: "usuarios",     titulo: "Usuários",     desc: "Novos cadastros, usuários reincidentes e sinais de abuso" },
        { chave: "anuncios",     titulo: "Anúncios",     desc: "Novos anúncios publicados e anúncios muito denunciados" },
        { chave: "denuncias",    titulo: "Denúncias e suporte", desc: "Denúncias, tickets de suporte e contestações de suspensão" },
        { chave: "pagamentos",   titulo: "Pagamentos",   desc: "Pagamentos processados, falhas, estornos, atrasos e multas" },
        { chave: "avaliacoes",   titulo: "Avaliações",   desc: "Avaliações negativas" },
        { chave: "verificacoes", titulo: "Verificações", desc: "Documentos enviados, reenviados ou aguardando há muito tempo" },
        { chave: "sistema",      titulo: "Sistema",      desc: "Falhas de webhook, estornos pendentes e erros de upload" }
    ];

    // Estilo mínimo dos interruptores (o resto reaproveita configuracoes.css)
    const estilo = document.createElement("style");
    estilo.textContent = `
        .pref-lista{ display:flex; flex-direction:column; }
        .pref-linha{ display:flex; align-items:center; justify-content:space-between; gap:16px; padding:14px 0; border-bottom:1px solid var(--borda); }
        .pref-linha:last-child{ border-bottom:none; }
        .pref-linha strong{ display:block; font-size:14px; }
        .pref-linha span.pref-desc{ display:block; margin-top:2px; font-size:12.5px; color:var(--texto-suave); }
        .pref-switch{ position:relative; flex:0 0 auto; width:44px; height:24px; }
        .pref-switch input{ position:absolute; inset:0; width:100%; height:100%; margin:0; opacity:0; cursor:pointer; }
        .pref-switch i{ position:absolute; inset:0; border-radius:999px; background:var(--borda); transition:background .2s; pointer-events:none; }
        .pref-switch i::after{ content:""; position:absolute; top:3px; left:3px; width:18px; height:18px; border-radius:50%; background:#fff; transition:transform .2s; }
        .pref-switch input:checked + i{ background:var(--roxo); }
        .pref-switch input:checked + i::after{ transform:translateX(20px); }
        .pref-switch input:focus-visible + i{ outline:3px solid rgba(109,73,242,.4); outline-offset:2px; }
        .pref-switch input:disabled{ cursor:not-allowed; }
        .pref-switch input:disabled + i{ opacity:.5; }
    `;
    document.head.appendChild(estilo);

    // ---------- aba + painel ----------
    const aba = document.createElement("button");
    aba.className = "cfg-tab";
    aba.setAttribute("role", "tab");
    aba.dataset.tab = "notificacoes";
    aba.innerHTML = `<i class="bi bi-bell"></i> Notificações`;
    menu.appendChild(aba);

    const painel = document.createElement("section");
    painel.className = "cfg-panel";
    painel.id = "painel-notificacoes";
    painel.innerHTML = `
        <h2>Preferências de notificação</h2>
        <p class="dica dica-formato">Escolha o que aparece na sua central de notificações e nos contadores do menu. Isso vale só para a sua conta.</p>

        <div class="cfg-aviso" id="prefAvisoCarga" role="alert" hidden>
            <span id="prefAvisoCargaTexto"></span>
            <button type="button" class="btn-secundario btn-pequeno" id="prefRecarregar">Tentar novamente</button>
        </div>

        <form id="formPrefNotif" novalidate>
            <div class="pref-lista">
                <div class="pref-linha">
                    <div><strong>Mostrar apenas notificações urgentes</strong><span class="pref-desc">Esconde tudo que não for de prioridade alta.</span></div>
                    <label class="pref-switch"><input type="checkbox" id="prefSomenteUrgentes" aria-label="Mostrar apenas notificações urgentes"><i></i></label>
                </div>
            </div>

            <hr>
            <h3>Categorias</h3>
            <div class="pref-lista" id="prefCategorias">
                ${CATEGORIAS.map(c => `
                <div class="pref-linha">
                    <div><strong>${c.titulo}</strong><span class="pref-desc">${c.desc}</span></div>
                    <label class="pref-switch"><input type="checkbox" data-categoria="${c.chave}" aria-label="${c.titulo}" checked><i></i></label>
                </div>`).join("")}
            </div>
            <p class="dica">Notificações urgentes continuam aparecendo mesmo em categorias desligadas, para você não perder nada crítico.</p>

            <p class="msg" id="msgPrefNotif" role="status"></p>
            <div class="acoes">
                <button type="button" class="btn-secundario" id="prefRestaurar">Restaurar padrão</button>
                <button type="submit" class="btn-primario" id="prefSalvar"><i class="bi bi-floppy"></i> Salvar Preferências</button>
            </div>
        </form>
    `;
    conteudo.appendChild(painel);

    const $ = (id) => document.getElementById(id);
    const inputsCategoria = () => [...painel.querySelectorAll("input[data-categoria]")];

    function msg(texto, tipo) {
        const el = $("msgPrefNotif");
        el.textContent = texto;
        el.classList.remove("erro", "sucesso", "info");
        if (tipo) el.classList.add(tipo);
    }

    function textoErro(err, padrao) {
        if (err instanceof TypeError) return "Sem conexão. Verifique sua internet e tente novamente.";
        if (err?.status === 403) return "Você não tem permissão para realizar esta ação.";
        return err?.message || padrao;
    }

    function aplicarNoFormulario(prefs) {
        const categorias = prefs?.categorias || {};
        inputsCategoria().forEach(i => { i.checked = categorias[i.dataset.categoria] !== false; });
        $("prefSomenteUrgentes").checked = !!prefs?.somente_urgentes;
    }

    function lerFormulario() {
        const categorias = {};
        inputsCategoria().forEach(i => { categorias[i.dataset.categoria] = i.checked; });
        return { categorias, somente_urgentes: $("prefSomenteUrgentes").checked };
    }

    function bloquear(bloqueado) {
        painel.querySelectorAll("input, #prefSalvar, #prefRestaurar").forEach(el => { el.disabled = bloqueado; });
    }

    async function carregar() {
        $("prefAvisoCarga").hidden = true;
        try {
            aplicarNoFormulario(await window.ApiVizin.get("/admin/notificacoes/preferencias"));
            bloquear(false);
        } catch (err) {
            bloquear(true);
            $("prefAvisoCargaTexto").textContent = textoErro(err, "Não foi possível carregar suas preferências.");
            $("prefAvisoCarga").hidden = false;
        }
    }

    // ---------- troca de aba (a aba nova não existia quando configuracoes.js ligou os cliques) ----------
    aba.addEventListener("click", () => {
        document.querySelectorAll(".cfg-tab").forEach(t => {
            t.classList.toggle("active", t === aba);
            t.setAttribute("aria-selected", t === aba);
        });
        document.querySelectorAll(".cfg-panel").forEach(p => p.classList.toggle("active", p === painel));
    });

    $("prefRecarregar").addEventListener("click", carregar);

    $("prefRestaurar").addEventListener("click", () => {
        aplicarNoFormulario({ categorias: {}, somente_urgentes: false });
        msg("Padrão restaurado. Clique em Salvar Preferências para confirmar.", "info");
    });

    $("formPrefNotif").addEventListener("submit", async (e) => {
        e.preventDefault();
        const botao = $("prefSalvar");
        const htmlBotao = botao.innerHTML;
        botao.disabled = true;
        botao.textContent = "Salvando...";
        msg("");
        try {
            await window.ApiVizin.put("/admin/notificacoes/preferencias", lerFormulario());
            msg("Preferências salvas com sucesso!", "sucesso");
            // Os contadores da sidebar dependem das preferências.
            if (typeof window.atualizarBadgesAdmin === "function") window.atualizarBadgesAdmin();
        } catch (err) {
            msg(textoErro(err, "Não foi possível salvar as preferências."), "erro");
        } finally {
            botao.disabled = false;
            botao.innerHTML = htmlBotao;
        }
    });

    carregar();
})();