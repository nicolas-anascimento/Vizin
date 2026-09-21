const form = document.getElementById("formResetar");
const campoSenha = document.getElementById("novaSenha");
const campoConfirmar = document.getElementById("confirmarSenha");
const mensagem = document.getElementById("mensagem");
const btn = form.querySelector("button[type=submit]");
const blocoInvalido = document.getElementById("resetInvalido");
 
const token = new URLSearchParams(window.location.search).get("token");
 
// =====================================================
// Se não veio token na URL, o link é inválido/expirado:
// esconde o formulário e mostra o aviso, em vez de deixar
// o usuário preencher tudo pra só descobrir o problema
// depois de clicar em "Alterar Senha".
// =====================================================
if (!token) {
    form.style.display = "none";
    mensagem.style.display = "none";
    blocoInvalido.style.display = "block";
}
 
// =====================================================
// MOSTRAR/OCULTAR SENHA (mesmo padrão do login.js)
// =====================================================
function ligarToggleSenha(iconId, inputId) {
    const icone = document.getElementById(iconId);
    const input = document.getElementById(inputId);
    if (!icone || !input) return;
 
    icone.addEventListener("click", () => {
        const senhaVisivel = input.type === "text";
 
        input.type = senhaVisivel ? "password" : "text";
        icone.classList.toggle("bi-eye-slash", senhaVisivel);
        icone.classList.toggle("bi-eye", !senhaVisivel);
    });
}
 
ligarToggleSenha("novaSenhaToggle", "novaSenha");
ligarToggleSenha("confirmarSenhaToggle", "confirmarSenha");
 
// =====================================================
// VALIDAÇÃO DE SENHA
// Mesma regra usada no cadastro (login.js): mínimo 8
// caracteres, pelo menos 1 letra e 1 número.
// =====================================================
function validarSenha(senha) {
    if (!senha || senha.length < 8) {
        return { valido: false, mensagem: "A senha deve ter no mínimo 8 caracteres" };
    }
    if (!/[A-Za-z]/.test(senha)) {
        return { valido: false, mensagem: "A senha deve conter ao menos uma letra" };
    }
    if (!/[0-9]/.test(senha)) {
        return { valido: false, mensagem: "A senha deve conter ao menos um número" };
    }
    return { valido: true, mensagem: "" };
}
 
function mostrarMensagem(texto, tipo) {
    mensagem.textContent = texto;
    mensagem.classList.remove("erro", "sucesso");
    if (tipo) mensagem.classList.add(tipo);
}
 
// =====================================================
// SUBMIT
// =====================================================
form.addEventListener("submit", async (e) => {
    e.preventDefault();
 
    const senha = campoSenha.value;
    const confirmar = campoConfirmar.value;
 
    mostrarMensagem("", null);
 
    const resultadoSenha = validarSenha(senha);
    if (!resultadoSenha.valido) {
        mostrarMensagem(`❌ ${resultadoSenha.mensagem}`, "erro");
        return;
    }
 
    if (senha !== confirmar) {
        mostrarMensagem("❌ As senhas não coincidem.", "erro");
        return;
    }
 
    btn.disabled = true;
    const textoOriginal = btn.textContent;
    btn.textContent = "Alterando...";
 
    try {
        // Chamada centralizada em api.js (mantém headers, parse de erro
        // e nome dos campos de erro consistentes com o resto do app).
        await resetarSenha(token, senha);

        mostrarMensagem("✅ Senha alterada com sucesso!", "sucesso");
 
        setTimeout(() => {
            window.location.href = "/login";
        }, 2000);
 
    } catch (erro) {
        mostrarMensagem(`❌ ${erro.message}`, "erro");
        btn.disabled = false;
        btn.textContent = textoOriginal;
    }
});
