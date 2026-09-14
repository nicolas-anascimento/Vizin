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
 
        // BACK-END FUTURO:
        const resposta = await fetch("/api/contas/resetar-senha", {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify({ token, senha })
        });
 
        // fetch só rejeita em erro de rede — se o back-end recusar o
        // token (expirado/inválido/já usado) ou a senha, precisamos
        // checar aqui, senão o usuário vê "sucesso" mesmo sem a senha
        // ter sido alterada de fato.
        if (!resposta.ok) {
            let erroMsg = "Não foi possível alterar sua senha. O link pode ter expirado.";
            try {
                const dados = await resposta.json();
                if (dados && dados.mensagem) erroMsg = dados.mensagem;
            } catch {
                // resposta sem corpo JSON: mantém a mensagem genérica
            }
            throw new Error(erroMsg);
        }
 
        mostrarMensagem("✅ Senha alterada com sucesso!", "sucesso");
 
        setTimeout(() => {
            window.location.href = "../Login/index.html";
        }, 2000);
 
    } catch (erro) {
        mostrarMensagem(`❌ ${erro.message}`, "erro");
        btn.disabled = false;
        btn.textContent = textoOriginal;
    }
});