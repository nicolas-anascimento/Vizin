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

// ================= CADASTRO =================
document.querySelector('.Register form').addEventListener('submit', async (e) => {

    e.preventDefault();

    const nome = document.getElementById('registerNome').value;
    const email = document.getElementById('registerEmail').value;
    const senha = document.getElementById('registerSenha').value;

    const erro = document.getElementById('registerErro');

    erro.textContent = "Carregando...";
    erro.classList.remove("erro", "sucesso");

    try {

        const data = await cadastrar(nome, email, senha);

        if (data.success) {

            erro.textContent = "Conta criada com sucesso!";
            erro.classList.add("sucesso");

            setTimeout(() => {
                container.classList.remove('active');
            }, 1500);

        } else {

            erro.textContent = data.message || "Erro ao cadastrar";
            erro.classList.add("erro");

        }

    } catch (err) {

        erro.textContent = "Erro ao conectar com servidor";
        erro.classList.add("erro");

    }

});

// ================= LOGIN =================
document.querySelector('.Login form').addEventListener('submit', async (e) => {

    e.preventDefault();

    const email = document.getElementById('loginEmail').value;
    const senha = document.getElementById('loginSenha').value;

    const erro = document.getElementById('loginErro');

    erro.textContent = "Carregando...";
    erro.classList.remove("erro", "sucesso");

    try {

        const data = await login(email, senha);

        if (data.success) {

            erro.textContent = "Login realizado com sucesso!";
            erro.classList.add("sucesso");


            // ================= REDIRECIONAMENTO =================
            setTimeout(() => {

                // ADMIN
                if (data.tipo === "admin") {

                    window.location.href = "/admin";

                }

                // USUÁRIO NORMAL
                else {

                    window.location.href = "/home";

                }

            }, 1000);

        } else {

            erro.textContent = data.message || "Email ou senha inválidos";
            erro.classList.add("erro");

        }

    } catch (err) {

        erro.textContent = "Erro ao conectar com servidor";
        erro.classList.add("erro");

    }

});
