/* =====================================================
   AVATAR VIZIN — foto de perfil com fallback para a inicial
   -----------------------------------------------------
   produto.js e admin-anuncio-acoes.js já chamam estes helpers:
     AvatarVizin.html(url, nome)   -> HTML do miolo do círculo (<img> ou inicial)
     AvatarVizin.deAvaliacao(av)   -> URL da foto de quem avaliou (ou null)
     avatarAdminHtml(url, inicial) -> igual, para o painel admin
   Só define o que ainda não existir (pode já estar em outro arquivo do site).
   Se a imagem falhar ao carregar, volta para a inicial sozinho.
   ===================================================== */
(function () {
    "use strict";

    const esc = v => String(v ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
    const inicialDe = nome => (String(nome || "?").trim().charAt(0) || "?").toUpperCase();

    function html(url, nome) {
        const inicial = inicialDe(nome);
        if (!url) return esc(inicial);
        return `<img class="avatar-foto" src="${esc(url)}" alt="" data-inicial="${esc(inicial)}" loading="lazy">`;
    }

    function deAvaliacao(av) {
        if (!av) return null;
        return av.avaliadorAvatarUrl || av.avaliador_avatar_url || av.avatarAvaliador
            || av.avaliador?.avatarUrl || av.avaliador?.avatar_url || av.avatarUrl || null;
    }

    if (!window.AvatarVizin) window.AvatarVizin = { html, deAvaliacao };

    if (!window.avatarAdminHtml) {
        window.avatarAdminHtml = (url, inicial) => html(url, inicial);
    }

    // Foto que falhou ao carregar: troca pela inicial (sem handler inline, compatível com CSP)
    document.addEventListener("error", (e) => {
        const img = e.target;
        if (!(img instanceof HTMLImageElement) || !img.classList.contains("avatar-foto")) return;
        img.replaceWith(document.createTextNode(img.dataset.inicial || "?"));
    }, true);
})();