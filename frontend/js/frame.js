fetch("header.html")
    .then(r => {
        if (!r.ok) throw new Error(`Erro ${r.status} ao buscar header.html`);
        return r.text();
    })
    .then(html => document.getElementById("header").innerHTML = html)
    .catch(err => console.error("Falha ao carregar header:", err));

fetch("footer.html")
    .then(r => {
        if (!r.ok) throw new Error(`Erro ${r.status} ao buscar footer.html`);
        return r.text();
    })
    .then(html => document.getElementById("footer").innerHTML = html)
    .catch(err => console.error("Falha ao carregar footer:", err));