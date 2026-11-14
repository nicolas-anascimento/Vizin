(async function confirmarEmail() {
    "use strict";
    const mensagem = document.getElementById("mensagem");
    const params = new URLSearchParams(window.location.search);
    const token = params.get("token");
    const tipo = params.get("tipo");
    // Retira o token da barra de endereço e do histórico antes da requisição.
    window.history.replaceState(null, "", window.location.pathname);
    if (!token || !/^[a-f0-9]{64}$/.test(token)) {
        mensagem.textContent = "Este link é inválido ou expirou. Solicite um novo link.";
        return;
    }

    const endpoint = tipo === "alteracao"
        ? "/api/usuarios/email/confirmar"
        : "/api/usuarios/email/verificar";
    try {
        const resposta = await fetch(endpoint, {
            method: "POST",
            credentials: "same-origin",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ token })
        });
        if (!resposta.ok) {
            mensagem.textContent = "Este link é inválido, expirou ou já foi utilizado. Solicite um novo link.";
            return;
        }
        mensagem.textContent = tipo === "alteracao"
            ? "E-mail alterado com sucesso. Entre novamente para continuar."
            : "E-mail confirmado com sucesso. Você já pode continuar.";
    } catch (_) {
        mensagem.textContent = "Não foi possível confirmar o e-mail. Tente novamente.";
    }
})();
