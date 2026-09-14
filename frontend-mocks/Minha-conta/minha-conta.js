// ================= PROTEGER PÁGINA =================
if (!localStorage.getItem("token")) {
    sessionStorage.setItem("mensagemLogin", "Você precisa estar logado para acessar sua conta.");
    window.location.href = "../Login/index.html";
}
 
// O botão "Sair da conta" (#btnLogout) já é tratado por delegação de
// eventos em Login/logout.js, carregado nesta página — não precisa de
// listener próprio aqui.
 