const API_URL = "/api";
 
async function apiRequest(endpoint, method = "GET", body = null) {
    const token = localStorage.getItem("token");
 
    const options = {
        method,
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
 
    const response = await fetch(`${API_URL}${endpoint}`, options);
    return await response.json();
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