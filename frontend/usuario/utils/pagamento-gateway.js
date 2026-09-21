// ============================================================
// Gateway de pagamento (Mercado Pago) — ÚNICO arquivo que conhece o SDK.
// Trocar de gateway = reescrever só este arquivo, mantendo as funções
// expostas em window.PagamentoGateway.
//
// Pré-requisitos na página (nesta ordem):
//   <script src="https://sdk.mercadopago.com/js/v2"></script>
//   <script src="../utils/config.js"></script>
//   <script src="../utils/pagamento-gateway.js"></script>
//
// SEGURANÇA: número, validade e CVV são digitados em iframes do próprio
// Mercado Pago ("secure fields"). Esses dados nunca passam pelo nosso
// JavaScript nem pelo nosso back-end — só o token gerado (uso único,
// expira em 7 dias) é enviado pra cá.
// ============================================================
(function () {
    "use strict";

    let mp = null;
    const campos = { numero: null, validade: null, cvv: null, cvvSalvo: null };
    let paymentMethodId = null; // "visa", "master"... detectado pelos primeiros dígitos

    function obterMP() {
        if (mp) return mp;
        if (!window.MercadoPago) {
            throw new Error("Não foi possível carregar o serviço de pagamento. Recarregue a página.");
        }
        const chave = window.VIZIN_CONFIG?.MP_PUBLIC_KEY;
        if (!chave) {
            console.error("[gateway] MP_PUBLIC_KEY não configurada em utils/config.js");
            throw new Error("Pagamento indisponível no momento. Tente novamente mais tarde.");
        }
        mp = new window.MercadoPago(chave, { locale: "pt-BR" });
        return mp;
    }

    // ---------------- montagem dos campos seguros ----------------
    function desmontar(nome) {
        try { campos[nome]?.unmount(); } catch (_) { /* já desmontado */ }
        campos[nome] = null;
    }

    function desmontarTudo() {
        Object.keys(campos).forEach(desmontar);
        paymentMethodId = null;
    }

    // Cartão novo: número + validade + CVV, cada um num <div> (ids recebidos).
    function montarCamposNovoCartao({ idNumero, idValidade, idCvv }) {
        const sdk = obterMP();
        desmontarTudo();

        campos.numero = sdk.fields.create("cardNumber", { placeholder: "0000 0000 0000 0000" }).mount(idNumero);
        campos.validade = sdk.fields.create("expirationDate", { placeholder: "MM/AA" }).mount(idValidade);
        campos.cvv = sdk.fields.create("securityCode", { placeholder: "CVV" }).mount(idCvv);

        // Bandeira (payment_method_id) a partir dos primeiros dígitos do cartão.
        campos.numero.on("binChange", async (dados) => {
            const bin = dados?.bin;
            if (!bin) { paymentMethodId = null; return; }
            try {
                const resposta = await sdk.getPaymentMethods({ bin });
                paymentMethodId = resposta?.results?.[0]?.id || null;
            } catch (_) {
                paymentMethodId = null;
            }
        });
    }

    // Cartão já salvo: só o CVV é pedido de novo.
    function montarCvvCartaoSalvo(idContainer) {
        const sdk = obterMP();
        desmontarTudo();
        campos.cvvSalvo = sdk.fields.create("securityCode", { placeholder: "CVV" }).mount(idContainer);
    }

    // ---------------- tokenização ----------------
    function somenteDigitos(v) {
        return String(v || "").replace(/\D/g, "");
    }

    async function tokenizarCartaoNovo({ titular, cpf }) {
        const sdk = obterMP();
        try {
            const token = await sdk.fields.createCardToken({
                cardholderName: titular,
                identificationType: "CPF",
                identificationNumber: somenteDigitos(cpf)
            });
            return { token: token.id, paymentMethodId };
        } catch (erro) {
            throw traduzirErroTokenizacao(erro);
        }
    }

    // cartaoId = id do cartão no gateway, devolvido por GET /cartoes.
    async function tokenizarCartaoSalvo(cartaoId) {
        const sdk = obterMP();
        try {
            const token = await sdk.fields.createCardToken({ cardId: cartaoId });
            return { token: token.id, paymentMethodId: null };
        } catch (erro) {
            throw traduzirErroTokenizacao(erro);
        }
    }

    // O SDK rejeita com um array (ou objeto) de erros. Tentamos apontar o
    // campo com problema; se não der pra identificar, vai a mensagem geral.
    function traduzirErroTokenizacao(erro) {
        console.error("[gateway] falha ao tokenizar o cartão");
        const lista = Array.isArray(erro) ? erro : [erro];
        const texto = lista
            .map(e => `${e?.field || ""} ${e?.code || ""} ${e?.message || ""} ${e?.description || ""}`)
            .join(" ")
            .toLowerCase();

        const porCampo = {};
        if (/cardnumber|card_number/.test(texto)) porCampo.numero = "Número de cartão inválido.";
        if (/expiration/.test(texto)) porCampo.validade = "Validade inválida ou expirada.";
        if (/securitycode|security_code|cvv|cvc/.test(texto)) porCampo.cvv = "CVV inválido.";
        if (/cardholder/.test(texto)) porCampo.titular = "Informe o nome como está no cartão.";
        if (/identification/.test(texto)) porCampo.cpf = "CPF inválido.";

        const e = new Error(
            Object.keys(porCampo).length
                ? "Confira os dados do cartão e tente novamente."
                : "Não foi possível validar o cartão. Confira os dados e tente novamente."
        );
        e.campos = porCampo;
        return e;
    }

    // ---------------- helpers de dados NÃO sensíveis ----------------
    function validarCpf(valor) {
        const c = somenteDigitos(valor);
        if (c.length !== 11 || /^(\d)\1{10}$/.test(c)) return false;
        for (let t = 9; t < 11; t++) {
            let soma = 0;
            for (let i = 0; i < t; i++) soma += Number(c[i]) * (t + 1 - i);
            if (((soma * 10) % 11) % 10 !== Number(c[t])) return false;
        }
        return true;
    }

    function ligarMascaraCpf(input) {
        if (!input) return;
        input.addEventListener("input", () => {
            input.value = somenteDigitos(input.value)
                .slice(0, 11)
                .replace(/(\d{3})(\d)/, "$1.$2")
                .replace(/(\d{3})(\d)/, "$1.$2")
                .replace(/(\d{3})(\d{1,2})$/, "$1-$2");
        });
    }

    // Identificador do dispositivo gerado automaticamente pelo SDK — o back
    // repassa ao Mercado Pago (antifraude aprova mais pagamentos legítimos).
    function obterDeviceId() {
        return window.MP_DEVICE_SESSION_ID || null;
    }

    window.PagamentoGateway = {
        montarCamposNovoCartao,
        montarCvvCartaoSalvo,
        desmontarTudo,
        tokenizarCartaoNovo,
        tokenizarCartaoSalvo,
        validarCpf,
        ligarMascaraCpf,
        obterDeviceId
    };
})();
