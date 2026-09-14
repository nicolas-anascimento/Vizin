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
 
        // BACK-END FUTURO:
        const resposta = await fetch("/api/contas/recuperar-senha", {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify({ email: campoEmail.value })
        });
 
        // fetch só rejeita em erro de rede — se o back-end responder
        // com status de erro (400, 500 etc.) precisamos checar aqui,
        // senão o usuário vê "sucesso" mesmo quando algo deu errado.
        if (!resposta.ok) {
            let erroMsg = "Não foi possível processar sua solicitação. Tente novamente mais tarde.";
            try {
                const dados = await resposta.json();
                if (dados && dados.mensagem) erroMsg = dados.mensagem;
            } catch {
                // resposta sem corpo JSON: mantém a mensagem genérica
            }
            throw new Error(erroMsg);
        }
 
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
 