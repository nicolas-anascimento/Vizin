const container = document.querySelector('.container');
const LoginLink = document.querySelector('.SignInLink');
const RegisterLink = document.querySelector('.SignUpLink');

// ================= TROCAR TELAS =================
if (RegisterLink) {
    RegisterLink.addEventListener('click', () => {
        container.classList.add('active');
    });
}

if (LoginLink) {
    LoginLink.addEventListener('click', () => {
        container.classList.remove('active');
    });
}

// =====================================================
// MOCK USUÁRIO PADRÃO
// =====================================================
const usuarioMock = {
    nome: "João",
    email: "teste@vizin.com",
    senha: "123456"
};

// =====================================================
// CADASTRO MOCK
// =====================================================
document.querySelector('.Register form').addEventListener('submit', (e) => {

    e.preventDefault();

    const nome = document.getElementById('registerNome').value;
    const email = document.getElementById('registerEmail').value;
    const senha = document.getElementById('registerSenha').value;

    const erro = document.getElementById('registerErro');

    erro.textContent = "Carregando...";
    erro.classList.remove("erro", "sucesso");

    setTimeout(() => {

        // salva usuário fake
        localStorage.setItem("usuarioMock", JSON.stringify({
            nome,
            email,
            senha
        }));

        erro.textContent = "Conta criada com sucesso!";
        erro.classList.add("sucesso");

        setTimeout(() => {
            container.classList.remove('active');
        }, 1500);

    }, 1000);

});

// =====================================================
// LOGIN MOCK
// =====================================================
document.querySelector('.Login form').addEventListener('submit', (e) => {

    e.preventDefault();

    const email = document.getElementById('loginEmail').value;
    const senha = document.getElementById('loginSenha').value;

    const erro = document.getElementById('loginErro');

    erro.textContent = "Carregando...";
    erro.classList.remove("erro", "sucesso");

    setTimeout(() => {

        // usuário criado no cadastro
        const usuarioSalvo = JSON.parse(localStorage.getItem("usuarioMock"));

        // usuário padrão
        const emailCorreto =
            email === usuarioMock.email &&
            senha === usuarioMock.senha;

        // usuário cadastrado
        const usuarioCadastrado =
            usuarioSalvo &&
            email === usuarioSalvo.email &&
            senha === usuarioSalvo.senha;

        if (emailCorreto || usuarioCadastrado) {

            const usuarioFinal = usuarioCadastrado
                ? usuarioSalvo
                : usuarioMock;

            erro.textContent = "Login realizado com sucesso!";
            erro.classList.add("sucesso");

            // salva token fake
            localStorage.setItem("token", "fake-token");

            // salva usuário logado
            localStorage.setItem("usuario", JSON.stringify({
                nome: usuarioFinal.nome,
                email: usuarioFinal.email
            }));

            setTimeout(() => {
                window.location.href = "../Inicio/index.html";
            }, 1000);

        } else {

            erro.textContent = "Email ou senha inválidos";
            erro.classList.add("erro");

        }

    }, 1000);

});