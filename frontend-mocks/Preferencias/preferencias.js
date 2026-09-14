// ================= PROTEGER PÁGINA =================
if (!localStorage.getItem("token")) {
    sessionStorage.setItem("mensagemLogin", "Você precisa estar logado para acessar suas notificações.");
    window.location.href = "../Login/index.html";
}
 
const CHAVE_PREFERENCIAS = "vizin_notif_prefs";
 
// Todos ligados por padrão — a pessoa desliga o que não quiser, em vez de
// começar tudo desligado e "perder" notificações importantes sem perceber.
const PADRAO = {
    solicitacao_recebida: true,
    solicitacao_respondida: true,
    lembretes_aluguel: true,
    avaliacao_recebida: true,
    mensagens: true,
    novidades: false,
    canal_whatsapp: true
};
 
function carregarPreferencias() {
    const salvas = JSON.parse(localStorage.getItem(CHAVE_PREFERENCIAS) || "null");
    return { ...PADRAO, ...(salvas || {}) };
}
 
function salvarPreferencias(prefs) {
    // PONTO DE INTEGRAÇÃO COM O BACK-END:
    // apiRequest("/usuarios/preferencias-notificacao", "PUT", prefs);
    localStorage.setItem(CHAVE_PREFERENCIAS, JSON.stringify(prefs));
}
 
const prefsAtuais = carregarPreferencias();
const toggles = document.querySelectorAll("[data-pref]");
const mensagemEl = document.getElementById("mensagemPreferencias");
 
toggles.forEach(toggle => {
    const chave = toggle.dataset.pref;
    toggle.checked = !!prefsAtuais[chave];
 
    toggle.addEventListener("change", () => {
        prefsAtuais[chave] = toggle.checked;
        salvarPreferencias(prefsAtuais);
 
        mensagemEl.textContent = "Preferências salvas.";
        clearTimeout(window._notifPrefTimeout);
        window._notifPrefTimeout = setTimeout(() => { mensagemEl.textContent = ""; }, 2000);
    });
});
 