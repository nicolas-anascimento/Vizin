// ================= DEVOLUÇÃO VIZIN — MÓDULO COMPARTILHADO =================
// Mesmo padrão do retirada-shared.js: controla o status de envio de fotos de
// cada parte no momento da DEVOLUÇÃO, permitindo que a página de uma pessoa
// "saiba" se a outra já enviou as fotos dela.
//
// PONTO DE INTEGRAÇÃO COM O BACK-END:
// Nesta versão (mock) o status fica no localStorage. Em produção deve virar:
//   POST /api/devolucoes/:aluguelId/fotos
//   GET  /api/devolucoes/:aluguelId/status
// com o polling abaixo trocado por WebSocket ou por esse GET periódico.

const DevolucaoVizin = (function () {
    const CHAVE = "vizin_devolucoes_status";

    function lerTudo() {
        return JSON.parse(localStorage.getItem(CHAVE) || "{}");
    }

    function salvarTudo(dados) {
        localStorage.setItem(CHAVE, JSON.stringify(dados));
    }

    function estadoInicial() {
        return {
            locatario: { enviado: false, quantidade: 0, fotos: [] },
            proprietario: { enviado: false, quantidade: 0, fotos: [] },
            concluidoEm: null
        };
    }

    function obterStatus(aluguelId) {
        const tudo = lerTudo();
        return tudo[aluguelId] || estadoInicial();
    }

    // PONTO DE INTEGRAÇÃO COM O BACK-END:
    // Mesma observação do retirada-shared.js: aqui as fotos ficam salvas em
    // base64 só pra visualização no Histórico sem back-end real.
    function enviarFotos(aluguelId, papel, quantidade, observacoes, fotos) {
        const tudo = lerTudo();
        const atual = tudo[aluguelId] || estadoInicial();

        atual[papel] = {
            enviado: true,
            quantidade,
            observacoes: observacoes || "",
            fotos: fotos || [],
            enviadoEm: new Date().toISOString()
        };

        if (atual.locatario.enviado && atual.proprietario.enviado && !atual.concluidoEm) {
            atual.concluidoEm = new Date().toISOString();
        }

        tudo[aluguelId] = atual;
        salvarTudo(tudo);

        return atual;
    }

    function ambosConcluidos(aluguelId) {
        const status = obterStatus(aluguelId);
        return status.locatario.enviado && status.proprietario.enviado;
    }

    return { obterStatus, enviarFotos, ambosConcluidos };
})();

window.DevolucaoVizin = DevolucaoVizin;