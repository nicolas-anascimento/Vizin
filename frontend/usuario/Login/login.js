const container = document.querySelector('.container');
const LoginLink = document.querySelector('.SignInLink');
const RegisterLink = document.querySelector('.SignUpLink');
 
// ================= MENSAGEM VINDA DE OUTRA TELA =================
// Ex: a Início redireciona pra cá quando não há token e deixa um
// aviso em sessionStorage("mensagemLogin") — mostra esse motivo em
// vez de deixar o usuário "cair" na tela de login sem explicação.
// sessionStorage (não localStorage) porque é um aviso de uma única
// vez: some sozinho ao ser lido e não deve sobreviver além da sessão.
(function mostrarMensagemPendente() {
 
    const mensagem = sessionStorage.getItem("mensagemLogin");
 
    if (!mensagem) return;
 
    sessionStorage.removeItem("mensagemLogin");
 
    const erro = document.getElementById("loginErro");
 
    if (!erro) return;
 
    erro.textContent = mensagem;
    erro.classList.remove("erro", "sucesso");
    erro.classList.add("info");
 
})();
 
// ================= TROCAR TELAS (Login <-> Cadastro) =================
if (RegisterLink) {
    RegisterLink.addEventListener('click', () => {
        container.classList.add('active');
    });
}
 
if (LoginLink) {
    LoginLink.addEventListener('click', () => {
        container.classList.remove('active');
        resetCadastro();
    });
}

// /cadastro reutiliza esta página e abre diretamente o formulário correto.
if (new URLSearchParams(window.location.search).get("cadastro") === "1") {
    container.classList.add("active");
}
 
// =====================================================
// HELPERS DE FORMATAÇÃO (MÁSCARAS)
// =====================================================
 
// Deixa só dígitos
function somenteNumeros(valor) {
    return (valor || "").replace(/\D/g, "");
}
 
// Aplica máscara 000.000.000-00 enquanto o usuário digita
function formatarCPF(valor) {
    let v = somenteNumeros(valor).slice(0, 11);
    v = v.replace(/(\d{3})(\d)/, "$1.$2");
    v = v.replace(/(\d{3})(\d)/, "$1.$2");
    v = v.replace(/(\d{3})(\d{1,2})$/, "$1-$2");
    return v;
}
 
// Aplica máscara (00) 00000-0000 enquanto o usuário digita
function formatarWhatsapp(valor) {
    let v = somenteNumeros(valor).slice(0, 11);
    v = v.replace(/^(\d{2})(\d)/, "($1) $2");
    v = v.replace(/(\d{5})(\d{1,4})$/, "$1-$2");
    return v;
}
 
function ligarMascara(input, formatador) {
    if (!input) return;
    input.addEventListener("input", () => {
        input.value = formatador(input.value);
    });
}
 
ligarMascara(document.getElementById("loginCpf"), formatarCPF);
ligarMascara(document.getElementById("registerCpf"), formatarCPF);
ligarMascara(document.getElementById("registerWhatsapp"), formatarWhatsapp);
 
// =====================================================
// MOSTRAR/OCULTAR SENHA
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
 
ligarToggleSenha("loginSenhaToggle", "loginSenha");
ligarToggleSenha("registerSenhaToggle", "registerSenha");
ligarToggleSenha("registerConfirmarSenhaToggle", "registerConfirmarSenha");
 
// =====================================================
// VALIDAÇÃO DE CPF (dígitos verificadores)
// =====================================================
function validarCPF(cpf) {
    const cpfLimpo = somenteNumeros(cpf);
 
    if (cpfLimpo.length !== 11) return false;
 
    // Rejeita CPFs com todos os dígitos iguais (000.000.000-00, 111.111.111-11 etc.)
    if (/^(\d)\1{10}$/.test(cpfLimpo)) return false;
 
    let soma = 0;
    for (let i = 0; i < 9; i++) {
        soma += parseInt(cpfLimpo.charAt(i), 10) * (10 - i);
    }
    let resto = (soma * 10) % 11;
    if (resto === 10 || resto === 11) resto = 0;
    if (resto !== parseInt(cpfLimpo.charAt(9), 10)) return false;
 
    soma = 0;
    for (let i = 0; i < 10; i++) {
        soma += parseInt(cpfLimpo.charAt(i), 10) * (11 - i);
    }
    resto = (soma * 10) % 11;
    if (resto === 10 || resto === 11) resto = 0;
    if (resto !== parseInt(cpfLimpo.charAt(10), 10)) return false;
 
    return true;
}
 
// =====================================================
// VALIDAÇÃO DE SENHA
// Regras: mínimo 8 caracteres, pelo menos 1 letra e 1 número
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
 
function validarEmail(email) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}
 
function validarWhatsapp(whatsapp) {
    const numeros = somenteNumeros(whatsapp);
    return numeros.length === 10 || numeros.length === 11;
}
 
// =====================================================
// CADASTRO EM 3 ETAPAS
// =====================================================
const cadastroForm = document.getElementById("cadastroForm");
const cadastroTrack = document.getElementById("cadastroTrack");
const dots = document.querySelectorAll(".step-dot");
 
let etapaAtual = 1;
const dadosCadastro = {};
 
function irParaEtapa(numero) {
    etapaAtual = numero;
    cadastroTrack.style.transform = `translateX(-${(numero - 1) * (100 / 3)}%)`;
    dots.forEach(dot => {
        dot.classList.toggle("active", Number(dot.dataset.dot) === numero);
    });
}
 
function mostrarErroEtapa(id, mensagem) {
    const erro = document.getElementById(id);
    erro.textContent = mensagem;
    erro.classList.remove("sucesso");
    erro.classList.add("erro");
}
 
function limparErroEtapa(id) {
    const erro = document.getElementById(id);
    erro.textContent = "";
    erro.classList.remove("erro", "sucesso");
}
 
function resetCadastro() {
    cadastroForm.reset();
    Object.keys(dadosCadastro).forEach(k => delete dadosCadastro[k]);
    ["step1Erro", "step2Erro", "registerErro"].forEach(limparErroEtapa);
    irParaEtapa(1);
}
 
// ================= ACEITE DOS TERMOS (obrigatório) =================
const checkboxAceitarTermos = document.getElementById("registerAceitarTermos");
 
// ---------- ETAPA 1: nome e email ----------
document.getElementById("btnStep1Next").addEventListener("click", () => {
    const nome = document.getElementById("registerNome").value.trim();
    const email = document.getElementById("registerEmail").value.trim();
 
    limparErroEtapa("step1Erro");
 
    if (!nome) {
        return mostrarErroEtapa("step1Erro", "Informe seu nome");
    }
 
    if (!email || !validarEmail(email)) {
        return mostrarErroEtapa("step1Erro", "Informe um email válido");
    }
 
    dadosCadastro.nome = nome;
    dadosCadastro.email = email;
 
    irParaEtapa(2);
});
 
// ---------- ETAPA 2: senha e confirmar senha ----------
document.getElementById("btnStep2Back").addEventListener("click", () => {
    limparErroEtapa("step2Erro");
    irParaEtapa(1);
});
 
document.getElementById("btnStep2Next").addEventListener("click", () => {
    const senha = document.getElementById("registerSenha").value;
    const confirmarSenha = document.getElementById("registerConfirmarSenha").value;
 
    limparErroEtapa("step2Erro");
 
    const resultadoSenha = validarSenha(senha);
    if (!resultadoSenha.valido) {
        return mostrarErroEtapa("step2Erro", resultadoSenha.mensagem);
    }
 
    if (senha !== confirmarSenha) {
        return mostrarErroEtapa("step2Erro", "As senhas não coincidem");
    }
 
    dadosCadastro.senha = senha;
 
    irParaEtapa(3);
});
 
// ---------- ETAPA 3: CPF e WhatsApp ----------
document.getElementById("btnStep3Back").addEventListener("click", () => {
    limparErroEtapa("registerErro");
    irParaEtapa(2);
});
 
cadastroForm.addEventListener("submit", async (e) => {
    e.preventDefault();
 
    const cpf = document.getElementById("registerCpf").value.trim();
    const whatsapp = document.getElementById("registerWhatsapp").value.trim();
    const erro = document.getElementById("registerErro");
 
    limparErroEtapa("registerErro");
 
    if (!validarCPF(cpf)) {
        return mostrarErroEtapa("registerErro", "CPF inválido");
    }
 
    if (!validarWhatsapp(whatsapp)) {
        return mostrarErroEtapa("registerErro", "Informe um WhatsApp válido, com DDD");
    }
 
    if (!checkboxAceitarTermos || !checkboxAceitarTermos.checked) {
        return mostrarErroEtapa("registerErro", "Você precisa aceitar os Termos de Uso e a Política de Privacidade para continuar");
    }
 
    dadosCadastro.cpf = cpf;
    dadosCadastro.whatsapp = whatsapp;
 
    erro.textContent = "Carregando...";
    erro.classList.remove("erro", "sucesso");
 
    try {
        // TODO: confirmar com o back-end se CPF/email duplicado retorna um
        // status de erro específico (ex: 409) com mensagem própria — hoje
        // qualquer erro do back-end cai em apiRequest() e é lançado aqui.
        await cadastrar(
            dadosCadastro.nome,
            dadosCadastro.email,
            somenteNumeros(dadosCadastro.cpf),
            somenteNumeros(dadosCadastro.whatsapp),
            dadosCadastro.senha
        );

        erro.textContent = "Conta criada com sucesso!";
        erro.classList.remove("erro");
        erro.classList.add("sucesso");
 
        setTimeout(() => {
            container.classList.remove('active');
            resetCadastro();
        }, 1500);

    } catch (err) {
        mostrarErroEtapa("registerErro", err.message);
    }
 
});
 
// =====================================================
// LOGIN COM CPF
// =====================================================
document.getElementById("loginForm").addEventListener("submit", async (e) => {
 
    e.preventDefault();
 
    const cpf = document.getElementById("loginCpf").value.trim();
    const senha = document.getElementById("loginSenha").value;
 
    const erro = document.getElementById("loginErro");
    erro.classList.remove("erro", "sucesso", "info");
 
    // Valida formato do CPF
    if (!validarCPF(cpf)) {
        erro.textContent = "CPF inválido";
        erro.classList.add("erro");
        return;
    }
 
    // Verifica se a senha foi preenchida corretamente
    if (!senha) {
        erro.textContent = "Informe sua senha";
        erro.classList.add("erro");
        return;
    }
 
    erro.textContent = "Carregando...";
 
    try {
        // TODO: confirmar com o back-end o formato exato da resposta de sucesso
        // do POST /login. Abaixo assumimos { token, usuario: { nome, email, cpf } }.
        const resposta = await login(somenteNumeros(cpf), senha);

        localStorage.setItem("token", resposta.token);
        const { id, nome, email, tipo, avatarUrl, verificado } = resposta.usuario;
        localStorage.setItem("usuario", JSON.stringify({ id, nome, email, tipo, avatarUrl, verificado }));

        erro.textContent = "Login realizado com sucesso!";
        erro.classList.remove("erro");
        erro.classList.add("sucesso");
 
        setTimeout(() => {
            window.location.href = "/inicio";
        }, 1000);

    } catch (err) {
        erro.textContent = err.message;
        erro.classList.remove("sucesso");
        erro.classList.add("erro");
    }
 
});
 
