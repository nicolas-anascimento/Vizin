// ================= PROTEGER PÁGINA =================
if (!localStorage.getItem("token")) {
    sessionStorage.setItem("mensagemLogin", "Você precisa estar logado para acessar suas notificações.");
    window.location.href = "/login";
}

// As preferências agora ficam no back-end (GET/PUT /usuarios/preferencias-notificacao),
// e é o SERVIDOR quem decide se cada notificação deve ou não ser gerada. As
// funções de ler/salvar continuam em notificacoes-shared.js, que precisa ser
// incluído antes deste arquivo.
if (!window.NotificacoesVizin) {
    console.error("notificacoes-shared.js precisa ser incluído antes de preferencias.js.");
}

const toggles = document.querySelectorAll("[data-pref]");
const mensagemEl = document.getElementById("mensagemPreferencias");

function mostrarMensagem(texto, tipo) {
    mensagemEl.textContent = texto;
    mensagemEl.classList.toggle("erro", tipo === "erro");
    clearTimeout(window._notifPrefTimeout);
    window._notifPrefTimeout = setTimeout(() => { mensagemEl.textContent = ""; }, 2500);
}

(async function iniciar() {
    // Enquanto carrega, não deixa mexer (evita salvar por cima de valores que ainda não chegaram).
    toggles.forEach(t => { t.disabled = true; });

    try {
        await window.NotificacoesVizin.carregarPreferencias();
    } catch (erro) {
        console.error(erro);
        mostrarMensagem("Não foi possível carregar suas preferências agora.", "erro");
    }

    const prefsAtuais = window.NotificacoesVizin.obterPreferencias();

    toggles.forEach(toggle => {
        const chave = toggle.dataset.pref;
        toggle.checked = !!prefsAtuais[chave];
        toggle.disabled = false;

        toggle.addEventListener("change", async () => {
            const valorNovo = toggle.checked;
            toggle.disabled = true;

            try {
                // Envia o conjunto completo com a chave alterada; o back devolve o que ficou valendo.
                const salvas = await window.NotificacoesVizin.salvarPreferencias({ ...prefsAtuais, [chave]: valorNovo });
                Object.assign(prefsAtuais, salvas);
                toggle.checked = !!prefsAtuais[chave];
                mostrarMensagem("Preferências salvas.");
            } catch (erro) {
                console.error(erro);
                toggle.checked = !valorNovo; // desfaz na tela: não foi salvo
                mostrarMensagem(erro.message || "Não foi possível salvar. Tente novamente.", "erro");
            } finally {
                toggle.disabled = false;
            }
        });
    });
})();