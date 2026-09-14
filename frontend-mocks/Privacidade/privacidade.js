// ================= PROTEGER PÁGINA =================
if (!localStorage.getItem("token")) {
    sessionStorage.setItem("mensagemLogin", "Você precisa estar logado para acessar as configurações de privacidade.");
    window.location.href = "../Login/index.html";
}
 
const CHAVE_PRIVACIDADE = "vizin_privacidade";
 
const PADRAO_PRIVACIDADE = {
    perfilPublico: true
};
 
function carregarPrivacidade() {
    const salvo = JSON.parse(localStorage.getItem(CHAVE_PRIVACIDADE) || "null");
    return { ...PADRAO_PRIVACIDADE, ...(salvo || {}) };
}
 
function salvarPrivacidade(config) {
    // PONTO DE INTEGRAÇÃO COM O BACK-END:
    // apiRequest("/usuarios/privacidade", "PUT", config);
    localStorage.setItem(CHAVE_PRIVACIDADE, JSON.stringify(config));
}
 
const config = carregarPrivacidade();
 
const togglePerfilPublico = document.getElementById("toggle-perfil-publico");
togglePerfilPublico.checked = config.perfilPublico;
togglePerfilPublico.addEventListener("change", () => {
    config.perfilPublico = togglePerfilPublico.checked;
    salvarPrivacidade(config);
});
 
// ================= BAIXAR MEUS DADOS (LGPD) =================
document.getElementById("btn-baixar-dados").addEventListener("click", () => {
    // PONTO DE INTEGRAÇÃO COM O BACK-END:
    // Isso viria pronto de GET /api/usuarios/me/exportar — aqui montamos
    // um retrato dos dados já disponíveis no front, só pra demonstrar o
    // fluxo (o usuário consegue baixar e conferir o que existe sobre ele).
    const usuario = JSON.parse(localStorage.getItem("usuario") || "{}");
    const objetos = window.ObjetosVizin && usuario.email
        ? window.ObjetosVizin.obterDoProprietario(usuario.email)
        : [];
 
    const dados = {
        perfil: usuario,
        preferenciasNotificacao: JSON.parse(localStorage.getItem("vizin_notif_prefs") || "null"),
        privacidade: config,
        objetosAnunciados: objetos,
        geradoEm: new Date().toISOString()
    };
 
    const blob = new Blob([JSON.stringify(dados, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
 
    const link = document.createElement("a");
    link.href = url;
    link.download = "meus-dados-vizin.json";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
});
 