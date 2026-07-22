// ================= LOGOUT (via delegação de eventos) =================
document.addEventListener("click", (e) => {

    const btnLogout = e.target.closest("#btnLogout");

    if (!btnLogout) return;

    localStorage.removeItem("token");
    localStorage.removeItem("usuario");

    mostrarToast("Você saiu da conta ✔");

    setTimeout(() => {

        window.location.href = "index.html";

    }, 1000);

});