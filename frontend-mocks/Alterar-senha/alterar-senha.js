// ================= PROTEGER PÁGINA =================
if (!localStorage.getItem("token")) {
    sessionStorage.setItem("mensagemLogin", "Você precisa estar logado para acessar sua conta.");
    window.location.href = "../Login/index.html";
}
 
// ================= HELPERS (mesma regra do cadastro em Login/login.js) =================
function somenteNumerosSenha(valor) {
    return (valor || "").replace(/\D/g, "");
}
 
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
 
// ================= "BANCO" DE USUÁRIOS MOCK (mesma fonte do Login/login.js) =================
function obterUsuariosCadastradosSenha() {
    return JSON.parse(localStorage.getItem("usuariosVizin")) || [];
}
 
function salvarUsuariosCadastradosSenha(usuarios) {
    localStorage.setItem("usuariosVizin", JSON.stringify(usuarios));
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
 
    const usuarioSalvo = JSON.parse(localStorage.getItem("usuario") || "null");
 
    if (!usuarioSalvo || !usuarioSalvo.cpf) {
        mostrarMensagem("Não foi possível identificar sua conta. Faça login novamente.", "erro");
        return;
    }
 
    // PONTO DE INTEGRAÇÃO COM O BACK-END: o back-end é quem de fato valida
    // a senha atual (nunca deveríamos ter acesso à senha em texto puro no
    // front). Aqui, como o "banco" é mock em localStorage, simulamos essa
    // checagem localmente.
    const cpfLimpo = somenteNumerosSenha(usuarioSalvo.cpf);
    const usuarios = obterUsuariosCadastradosSenha();
    const indice = usuarios.findIndex(u => somenteNumerosSenha(u.cpf) === cpfLimpo);
 
    if (indice === -1) {
        // Conta de demonstração (ex: os usuários mock fixos do login.js) —
        // não existe registro editável em localStorage pra ela.
        mostrarMensagem("Esta é uma conta de demonstração e não permite alteração de senha.", "erro");
        return;
    }
 
    if (usuarios[indice].senha !== senhaAtual) {
        mostrarMensagem("Senha atual incorreta.", "erro");
        return;
    }
 
    const resultadoValidacao = validarSenhaNova(senhaNova);
    if (!resultadoValidacao.valido) {
        mostrarMensagem(resultadoValidacao.mensagem, "erro");
        return;
    }
 
    if (senhaNova === senhaAtual) {
        mostrarMensagem("A nova senha precisa ser diferente da senha atual.", "erro");
        return;
    }
 
    if (senhaNova !== senhaConfirmar) {
        mostrarMensagem("As senhas não coincidem.", "erro");
        return;
    }
 
    btnSalvar.disabled = true;
    btnSalvar.textContent = "Salvando...";
 
    try {
        // PONTO DE INTEGRAÇÃO COM O BACK-END:
        // await apiRequest("/usuarios/senha", "PUT", { senhaAtual, senhaNova });
        // Idealmente o back-end também invalida os outros tokens/sessões
        // ativos nesse momento, por segurança.
 
        await new Promise(resolve => setTimeout(resolve, 800));
 
        usuarios[indice].senha = senhaNova;
        salvarUsuariosCadastradosSenha(usuarios);
 
        mostrarMensagem("Senha alterada com sucesso!", "sucesso");
        form.reset();
 
        setTimeout(() => {
            window.location.href = "index.html";
        }, 1200);
 
    } catch (err) {
        console.error(err);
        mostrarMensagem("Não foi possível alterar sua senha. Tente novamente.", "erro");
    } finally {
        btnSalvar.disabled = false;
        btnSalvar.textContent = "Salvar nova senha";
    }
});
 