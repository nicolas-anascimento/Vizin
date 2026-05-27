const API_URL = "http://localhost:3000/api";

async function apiRequest(endpoint, method = "GET", body = null) {
    const options = {
        method,
        headers: {
            "Content-Type": "application/json"
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
