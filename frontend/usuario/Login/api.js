const API_URL = "/api";

// Rota web canônica, independente da profundidade do arquivo que usa o cliente.
const LOGIN_INDEX_URL = "/login";
const HOME_INDEX_URL = "/home";
const ADMIN_INDEX_URL = "/admin";

// O papel vem sempre do usuário devolvido pelo back-end na autenticação
// atual. O localStorage é somente cache e nunca decide o destino.
function destinoAposAutenticacao(usuario) {
    return usuario?.tipo === "admin" ? ADMIN_INDEX_URL : HOME_INDEX_URL;
}

function atualizarCacheUsuario(usuario) {
    const { id, nome, email, tipo, avatarUrl, verificado } = usuario;
    localStorage.setItem("usuario", JSON.stringify({ id, nome, email, tipo, avatarUrl, verificado }));
}

// Reconstrói uma sessão existente pelo servidor. O Bearer legado pode estar
// expirado enquanto o cookie httpOnly ainda é válido, por isso a segunda
// tentativa remove apenas o Bearer e deixa o back-end validar o cookie.
async function obterSessaoAtual() {
    const token = localStorage.getItem("token");
    const consultar = (bearer) => fetch(`${API_URL}/login/sessao`, {
        credentials: "same-origin",
        headers: bearer ? { Authorization: `Bearer ${bearer}` } : {}
    });

    let response = await consultar(token);
    if (response.status === 401 && token) {
        localStorage.removeItem("token");
        response = await consultar(null);
    }
    if (response.status === 401) return null;

    let data = null;
    try { data = await response.json(); } catch (_) { /* resposta sem JSON */ }
    if (!response.ok) {
        throw new Error(data?.mensagem || data?.message || "Não foi possível consultar sua sessão.");
    }
    return data;
}

async function apiRequest(endpoint, method = "GET", body = null, mensagemErroPadrao = "Não foi possível completar a solicitação. Tente novamente.") {
    const token = localStorage.getItem("token");

    const options = {
        method,
        credentials: "same-origin",
        headers: {
            "Content-Type": "application/json",
            // Anexa o token automaticamente quando o usuário estiver logado.
            // Rotas públicas (ex: /login, /usuarios ao cadastrar) simplesmente
            // ignoram esse header no back-end.
            ...(token ? { "Authorization": `Bearer ${token}` } : {})
        }
    };

    if (body) {
        options.body = JSON.stringify(body);
    }

    let response = await fetch(`${API_URL}${endpoint}`, options);

    // Tenta ler o corpo como JSON mesmo em respostas de erro, já que o
    // back-end normalmente manda { erro: "..." } / { message: "..." } nesses casos.
    let data = null;
    try {
        data = await response.json();
    } catch (e) {
        data = null;
    }

    if (response.status === 401 && token && endpoint !== "/login" && !/senha atual incorreta/i.test(data?.mensagem || data?.message || "")) {
        localStorage.removeItem("token");
        delete options.headers.Authorization;
        response = await fetch(`${API_URL}${endpoint}`, options);
        try { data = await response.json(); } catch (_) { data = null; }
    }

    if (!response.ok) {

        // ================= SESSÃO EXPIRADA =================
        // Só trata como "sessão expirada" quando: (1) a resposta foi 401,
        // (2) a requisição tinha um token salvo (ou seja, achávamos que
        // estava logado) e (3) o endpoint não é o próprio /login — senão
        // um CPF/senha errado na tela de login (que também retorna 401)
        // acabaria disparando esse redirecionamento por engano.
        //
        // TODO: confirmar com o back-end que 401 é usado SOMENTE para
        // token ausente/inválido/expirado, e não para erros de negócio
        // (ex: "senha atual incorreta" em PUT /usuarios/senha). Se algum
        // endpoint autenticado devolver 401 por outro motivo, ele vai
        // cair aqui e deslogar o usuário por engano — nesse caso o certo
        // é o back-end usar 400/403 para esse tipo de erro.
        if (response.status === 401 && token && endpoint !== "/login" && !/senha atual incorreta/i.test(data?.mensagem || data?.message || "")) {
            localStorage.removeItem("token");
            localStorage.removeItem("usuario");
            sessionStorage.setItem("mensagemLogin", "Sua sessão expirou. Faça login novamente.");
            window.location.href = LOGIN_INDEX_URL;
            throw new Error("Sessão expirada");
        }

        const mensagem = (data && (data.erro || data.mensagem || data.message))
            || mensagemErroPadrao;

        // Guarda o status HTTP no próprio erro para quem chamou poder
        // decidir o que fazer (ex: distinguir "rota ainda não existe no
        // back-end" de um erro de negócio real, como tentar excluir um
        // usuário que tem pendências).
        const erro = new Error(mensagem);
        erro.status = response.status;
        throw erro;
    }

    return data;
}

// LOGIN
// Autentica por CPF (não email) — é o campo usado na tela de Login.
async function login(cpf, senha) {
    return await apiRequest("/login", "POST", { cpf, senha });
}

// CADASTRO
// Inclui cpf e whatsapp, que a etapa 3 do formulário de cadastro
// também coleta (o cpf, inclusive, é a credencial de login).
async function cadastrar(nome, email, cpf, whatsapp, senha) {
    return await apiRequest("/usuarios", "POST", {
        nome,
        email,
        cpf,
        whatsapp,
        senha
    });
}

// RECUPERAR SENHA
// Sempre "sucesso" do ponto de vista da mensagem exibida (evita confirmar
// pra quem está tentando adivinhar se um email existe na base).
async function recuperarSenha(email) {
    return await apiRequest(
        "/contas/recuperar-senha",
        "POST",
        { email },
        "Não foi possível processar sua solicitação. Tente novamente mais tarde."
    );
}

// RESETAR SENHA
// token vem da URL do link enviado por email (?token=...).
async function resetarSenha(token, senha) {
    return await apiRequest(
        "/contas/resetar-senha",
        "POST",
        { token, senha },
        "Não foi possível alterar sua senha. O link pode ter expirado."
    );
}

// ALTERAR SENHA (usuário já logado, tela "Minha conta")
// O back-end é quem valida a senha atual — nunca fazemos essa checagem no front.
async function alterarSenha(senhaAtual, senhaNova) {
    return await apiRequest(
        "/usuarios/senha",
        "PUT",
        { senhaAtual, senhaNova },
        "Não foi possível alterar sua senha. Tente novamente."
    );
}

// EXCLUIR CONTA (usuário já logado)
// O back-end valida a senha e checa bloqueios (aluguéis ativos etc.) antes
// de efetivar a exclusão — a checagem feita no front é só uma UX prévia.
async function excluirConta(senha) {
    return await apiRequest(
        "/usuarios/me",
        "DELETE",
        { senha },
        "Não foi possível excluir sua conta. Tente novamente."
    );
}
