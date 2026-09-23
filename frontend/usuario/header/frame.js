// Reconstrói a sessão pelo servidor. Um Bearer expirado não deve esconder um cookie válido.
window.SessaoVizin = window.SessaoVizin || {};
const paginaPublicaVizin = document.body.dataset.publicPage === "true";
async function requisitarSessaoVizin(caminho, metodo = "GET") {
    const token = localStorage.getItem("token");
    let resposta = await fetch(caminho, {
        method: metodo, credentials: "same-origin",
        headers: token ? { Authorization: `Bearer ${token}` } : {}
    });
    if (resposta.status === 401 && token) {
        localStorage.removeItem("token");
        resposta = await fetch(caminho, { method: metodo, credentials: "same-origin" });
    }
    return resposta;
}
window.SessaoVizin.pronto = (async () => {
    const resposta = await requisitarSessaoVizin("/api/login/sessao");
    if (!resposta.ok) {
        localStorage.removeItem("usuario");
        if (!paginaPublicaVizin) window.location.href = "/login";
        return null;
    }
    const usuario = await resposta.json();
    const { id, nome, email, tipo, avatarUrl, verificado } = usuario;
    localStorage.setItem("usuario", JSON.stringify({ id, nome, email, tipo, avatarUrl, verificado }));
    return usuario;
})().catch(() => null);

// Carrega uma única conexão Socket.IO nas páginas autenticadas. O histórico e
// todas as ações continuam disponíveis por REST se o realtime não carregar.
function carregarScriptRealtime(src, id) {
    const existente = document.getElementById(id);
    if (existente) {
        return existente.dataset.loaded === "true"
            ? Promise.resolve()
            : new Promise((resolve, reject) => {
                existente.addEventListener("load", resolve, { once: true });
                existente.addEventListener("error", reject, { once: true });
            });
    }
    return new Promise((resolve, reject) => {
        const script = document.createElement("script");
        script.id = id;
        script.src = src;
        script.addEventListener("load", () => {
            script.dataset.loaded = "true";
            resolve();
        }, { once: true });
        script.addEventListener("error", reject, { once: true });
        document.head.appendChild(script);
    });
}

window.SessaoVizin.realtimePronto = window.SessaoVizin.pronto.then(async (usuario) => {
    if (!usuario) return null;
    await carregarScriptRealtime("/socket.io/socket.io.js", "vizin-socket-io-client");
    await carregarScriptRealtime("/assets/usuario/utils/socket-client.js", "vizin-socket-client");
    return window.SocketVizin?.connect() || null;
}).catch(() => null);

fetch("/partials/header")
    .then(r => {
        if (!r.ok) throw new Error(`Erro ${r.status} ao buscar o header`);
        return r.text();
    })
    .then(html => document.getElementById("header").innerHTML = html)
    .catch(err => console.error("Falha ao carregar header:", err));
 
fetch("/partials/footer")
    .then(r => {
        if (!r.ok) throw new Error(`Erro ${r.status} ao buscar o footer`);
        return r.text();
    })
    .then(html => document.getElementById("footer").innerHTML = html)
    .catch(err => console.error("Falha ao carregar footer:", err));
 
 
// ================= TOAST =================
// Cria a <div id="toast"> sozinho se a página esquecer de declarar,
// para não depender de lembrar de colar isso em todo HTML novo.
function garantirElementoToast() {
    let toast = document.getElementById("toast");
    if (!toast) {
        toast = document.createElement("div");
        toast.id = "toast";
        toast.className = "toast";
        document.body.appendChild(toast);
    }
    return toast;
}
 
function mostrarToast(mensagem, tipo = "sucesso") {
    const toast = garantirElementoToast();
 
    toast.innerText = mensagem;
    toast.className = `toast show ${tipo}`;
 
    setTimeout(() => {
        toast.classList.remove("show");
    }, 2500);
}
 
// ================= COPIAR EMAIL (via delegação de eventos) =================
document.addEventListener("click", async (e) => {
    const emailEl = e.target.closest("#emailEmpresa");
 
    if (!emailEl) return;
 
    const texto = emailEl.innerText.trim();
 
    if (navigator.clipboard && window.isSecureContext) {
 
        navigator.clipboard.writeText(texto)
        .then(() => {
            mostrarToast("📧 Email copiado ✔");
            if (window.tocarSomVizin) window.tocarSomVizin("curto");
        })
        .catch(() => {
            mostrarToast("Erro ao copiar ❌", "erro");
        });
 
    } else {
 
        // Fallback para contextos sem navigator.clipboard (ex: HTTP sem TLS)
        const textarea = document.createElement("textarea");
        textarea.value = texto;
        textarea.style.position = "fixed";
        textarea.style.opacity = "0";
        document.body.appendChild(textarea);
        textarea.focus();
        textarea.select();
 
        try {
            document.execCommand("copy");
            mostrarToast("📧 Email copiado ✔");
        } catch (err) {
            mostrarToast("Erro ao copiar ❌", "erro");
        }
 
        document.body.removeChild(textarea);
 
    }
 
});
 
// ================= MENU MOBILE (via delegação de eventos) =================
document.addEventListener("click", async (e) => {
 
    const toggle = e.target.closest("#menu-toggle");
 
    if (!toggle) return;
 
    const nav = document.querySelector("nav");
 
    if (nav) {
        nav.classList.toggle("active");
    }
 
});
 
// ================= LOGOUT (via delegação de eventos) =================
// Escuta a classe ".js-logout" em vez de um id fixo, porque agora existem
// TRÊS gatilhos de logout na página (botão SAIR do menu desktop, o ícone
// de Sair no menu fixo do topo no mobile, e o botão Sair da bottom-nav no
// mobile) — todos com essa mesma classe, então um único listener cobre
// os três, não importa em qual o usuário clicar.
document.addEventListener("click", async (e) => {
 
    const btnLogout = e.target.closest(".js-logout");
 
    if (!btnLogout) return;
 
    e.preventDefault(); // evita navegar para "#" quando o gatilho é um <a>
 
    btnLogout.disabled = true;
    try {
        const resposta = await requisitarSessaoVizin("/api/login/logout", "POST");
        if (!resposta.ok && resposta.status !== 401) throw new Error("Não foi possível encerrar a sessão no servidor.");
        localStorage.removeItem("token");
        localStorage.removeItem("usuario");
        window.SocketVizin?.disconnect();
    } catch (erro) {
        btnLogout.disabled = false;
        mostrarToast(erro.message || "Não foi possível sair. Tente novamente.", "erro");
        return;
    }

    mostrarToast("Você saiu da conta ✔");
 
    setTimeout(() => {
 
        window.location.href = "/login";
 
    }, 1000);
 
});
