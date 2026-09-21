// ============================================================
// Configuração de ambiente — único arquivo que muda entre
// desenvolvimento e produção. Carregar ANTES dos outros scripts
// de pagamento.
// ============================================================
window.VIZIN_CONFIG = {
    // URL base do back-end (sem barra no final).
    API_URL: "/api",

    // Public Key do Mercado Pago. É PÚBLICA (pode ficar no front):
    //   dev:      TEST-xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
    //   produção: APP_USR-xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
    // NUNCA colocar aqui o Access Token — ele é secreto e fica só no back-end.
    MP_PUBLIC_KEY: window.VIZIN_PUBLIC_CONFIG?.MP_PUBLIC_KEY || ""
};
