const usuario = JSON.parse(localStorage.getItem("usuario"));

if (!usuario || usuario.tipo !== "admin") {

    window.location.href = "home.html";

}