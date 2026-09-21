const form = document.getElementById("formRecuperar");
const campoEmail = document.getElementById("email");
const mensagem = document.getElementById("mensagem");
const btn = form.querySelector("button[type=submit]");
 
const TEMPO_COOLDOWN = 30; // segundos antes de permitir reenviar
let cooldownInterval = null;
 
function mostrarMensagem(texto, tipo) {
    mensagem.textContent = texto;
    mensagem.classList.remove("erro", "sucesso");
    if (tipo) mensagem.classList.add(tipo);
}
 
// =====================================================
// Depois de um envio com sucesso, trava o botão por um
// tempo pra evitar spam de e-mails de recuperação.
// =====================================================
function iniciarCooldown() {
    let restante = TEMPO_COOLDOWN;
    btn.disabled = true;
    btn.textContent = `Reenviar em ${restante}s`;
 
    clearInterval(cooldownInterval);
    cooldownInterval = setInterval(() => {
        restante--;
 
        if (restante <= 0) {
            clearInterval(cooldownInterval);
            btn.disabled = false;
            btn.textContent = "Enviar Link";
        } else {
            btn.textContent = `Reenviar em ${restante}s`;
        }
    }, 1000);
}
 
form.addEventListener("submit", async (e) => {
    e.preventDefault();
 
    mostrarMensagem("", null);
 
    btn.disabled = true;
    const textoOriginal = btn.textContent;
    btn.textContent = "Enviando...";
 
    try {
        // Chamada centralizada em api.js (mantém headers, parse de erro
        // e nome dos campos de erro consistentes com o resto do app).
        await recuperarSenha(campoEmail.value);

        mostrarMensagem(
            "✅ Se existir uma conta com este email, você receberá instruções para redefinir sua senha.",
            "sucesso"
        );
 
        iniciarCooldown();
 
    } catch (erro) {
        mostrarMensagem(
            `❌ ${erro.message || "Erro ao solicitar recuperação. Verifique sua conexão e tente novamente."}`,
            "erro"
        );
        btn.disabled = false;
        btn.textContent = textoOriginal;
    }
});
