// ================= PROTEGER PÁGINA =================
if (!localStorage.getItem("token")) {
    sessionStorage.setItem("mensagemLogin", "Você precisa estar logado para acessar suas notificações.");
    window.location.href = "../Login/index.html";
}

// As funções de ler/salvar preferências (e os valores padrão) agora moram
// em notificacoes-shared.js — é o mesmo módulo que decide, na hora de criar
// uma notificação, se ela deve ou não ser enviada. Usar a mesma fonte aqui
// garante que o que a pessoa vê marcado nesta tela é exatamente o que está
// sendo respeitado de verdade.
if (!window.NotificacoesVizin) {
    console.error("notificacoes-shared.js precisa ser incluído antes de preferencias.js.");
}

const prefsAtuais = window.NotificacoesVizin.obterPreferencias();
const toggles = document.querySelectorAll("[data-pref]");
const mensagemEl = document.getElementById("mensagemPreferencias");

toggles.forEach(toggle => {
    const chave = toggle.dataset.pref;
    toggle.checked = !!prefsAtuais[chave];

    toggle.addEventListener("change", () => {
        prefsAtuais[chave] = toggle.checked;
        window.NotificacoesVizin.salvarPreferencias(prefsAtuais);

        mensagemEl.textContent = "Preferências salvas.";
        clearTimeout(window._notifPrefTimeout);
        window._notifPrefTimeout = setTimeout(() => { mensagemEl.textContent = ""; }, 2000);
    });
});