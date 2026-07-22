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
async function login(email, senha) {
    return await apiRequest("/login", "POST", { email, senha });
}

// CADASTRO
async function cadastrar(nome, email, senha) {
    return await apiRequest("/usuarios", "POST", {
        nome,
        email,
        senha
    });
}