// ================= PROTEGER PÁGINA =================
if (!localStorage.getItem("token")) {
    sessionStorage.setItem("mensagemLogin", "Você precisa estar logado para acessar sua conta.");
    window.location.href = "/login";
}
 
// ================= HELPER (mesma regra de força de senha do cadastro em Login/login.js) =================
// Validação de formato só como primeira camada de UX — a regra "de
// verdade" precisa estar espelhada no back-end.
function validarSenhaNova(senha) {
    if (!senha || senha.length < 8) {
        return { valido: false, mensagem: "A nova senha deve ter no mínimo 8 caracteres" };
    }
    if (!/[A-Za-z]/.test(senha)) {
        return { valido: false, mensagem: "A nova senha deve conter ao menos uma letra" };
    }
    if (!/[0-9]/.test(senha)) {
        return { valido: false, mensagem: "A nova senha deve conter ao menos um número" };
    }
    return { valido: true, mensagem: "" };
}
 
// ================= TOGGLE MOSTRAR/OCULTAR SENHA =================
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
 
ligarToggleSenha("toggleSenhaAtual", "senhaAtual");
ligarToggleSenha("toggleSenhaNova", "senhaNova");
ligarToggleSenha("toggleSenhaConfirmar", "senhaConfirmar");
 
// ================= SUBMIT =================
const form = document.getElementById("formAlterarSenha");
const mensagemEl = document.getElementById("mensagemSenha");
const btnSalvar = document.getElementById("btnSalvarSenha");
 
function mostrarMensagem(texto, tipo) {
    mensagemEl.textContent = texto;
    mensagemEl.classList.remove("erro", "sucesso");
    if (tipo) mensagemEl.classList.add(tipo);
}
 
form.addEventListener("submit", async (e) => {
    e.preventDefault();
    mostrarMensagem("", null);
 
    const senhaAtual = document.getElementById("senhaAtual").value;
    const senhaNova = document.getElementById("senhaNova").value;
    const senhaConfirmar = document.getElementById("senhaConfirmar").value;
 
    const resultadoValidacao = validarSenhaNova(senhaNova);
    if (!resultadoValidacao.valido) {
        mostrarMensagem(resultadoValidacao.mensagem, "erro");
        return;
    }
 
    if (senhaNova !== senhaConfirmar) {
        mostrarMensagem("As senhas não coincidem.", "erro");
        return;
    }
 
    btnSalvar.disabled = true;
    btnSalvar.textContent = "Salvando...";
 
    try {
        // O back-end valida a senha atual e a regra da senha nova, e
        // idealmente invalida os outros tokens/sessões ativos por segurança.
        await alterarSenha(senhaAtual, senhaNova);
 
        mostrarMensagem("Senha alterada com sucesso!", "sucesso");
        form.reset();
 
        setTimeout(() => {
            window.location.href = "/alterar-senha";
        }, 1200);
 
    } catch (err) {
        // err.message vem do api.js (campo erro/mensagem/message da resposta),
        // ex: "Senha atual incorreta." — confirmar com o back-end esse texto.
        mostrarMensagem(err.message, "erro");
    } finally {
        btnSalvar.disabled = false;
        btnSalvar.textContent = "Salvar nova senha";
    }
});
 
