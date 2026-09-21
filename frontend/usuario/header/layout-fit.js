/**
 * layout-fit.js
 * ------------------------------------------------------------------
 * O <header> do site é position:fixed e sua altura varia (padding
 * percentual + conteúdo), então não dá pra reservar esse espaço só
 * com CSS fixo. Este script mede a altura REAL do header assim que
 * ele é injetado pelo frame.js e expõe isso como a variável CSS
 * --header-h, que outras páginas (como Mensagens) usam para não
 * ficar por baixo do menu.
 * ------------------------------------------------------------------
 */
(function () {
    function medirHeader() {
        const headerEl = document.querySelector("#header header");
        if (!headerEl) return;
        const altura = Math.ceil(headerEl.getBoundingClientRect().height);
        if (altura > 0) {
            document.documentElement.style.setProperty("--header-h", altura + "px");
        }
    }

    // O header é injetado de forma assíncrona por frame.js dentro de
    // #header — observamos essa div até o <header> real aparecer, e
    // continuamos observando pra reagir a mudanças (ex: usuário loga
    // e o conteúdo do header muda de tamanho).
    const headerContainer = document.getElementById("header");
    if (headerContainer) {
        const observer = new MutationObserver(medirHeader);
        observer.observe(headerContainer, { childList: true, subtree: true });
    }

    // Reage a rotação do celular / troca de breakpoint do hambúrguer.
    window.addEventListener("resize", medirHeader);
    window.addEventListener("load", medirHeader);
    document.addEventListener("DOMContentLoaded", medirHeader);

    // Tenta medir algumas vezes logo no início, cobrindo o caso do
    // header já estar pronto antes do observer ser anexado.
    medirHeader();
    setTimeout(medirHeader, 100);
    setTimeout(medirHeader, 500);
})();