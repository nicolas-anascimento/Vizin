fetch("../header/index.html")
    .then(r => {
        if (!r.ok) throw new Error(`Erro ${r.status} ao buscar ../header/index.html`);
        return r.text();
    })
    .then(html => document.getElementById("header").innerHTML = html)
    .catch(err => console.error("Falha ao carregar header:", err));

fetch("../footer/index.html")
    .then(r => {
        if (!r.ok) throw new Error(`Erro ${r.status} ao buscar ../footer/index.html`);
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
document.addEventListener("click", (e) => {
    console.log("clique em:", e.target);

    const emailEl = e.target.closest("#emailEmpresa");
    console.log("emailEl encontrado:", emailEl);

    if (!emailEl) return;

    const texto = emailEl.innerText.trim();

    if (navigator.clipboard && window.isSecureContext) {

        navigator.clipboard.writeText(texto)
        .then(() => {
            mostrarToast("📧 Email copiado ✔");
            if (window.tocarSomVizin) window.tocarSomVizin("curto"); // ← adicionar essa linha
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
document.addEventListener("click", (e) => {

    const toggle = e.target.closest("#menu-toggle");

    if (!toggle) return;

    const nav = document.querySelector("nav");

    if (nav) {
        nav.classList.toggle("active");
    }

});