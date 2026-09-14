// ================= RETIRADA VIZIN — MÓDULO COMPARTILHADO =================
// Controla o status de envio de fotos de cada parte (locatário / proprietário)
// no momento da retirada. Cada pessoa envia as fotos pelo próprio dispositivo,
// em sessões separadas — este módulo é o que permite que a página de uma
// pessoa "saiba" se a outra já enviou as fotos dela ou não.
//
// PONTO DE INTEGRAÇÃO COM O BACK-END:
// Nesta versão (mock), o status fica salvo no localStorage do navegador, então
// só funciona de verdade se as duas partes estiverem testando no mesmo
// navegador. Em produção, isso deve ser substituído por:
//   POST /api/retiradas/:aluguelId/fotos   (envia as fotos da parte logada)
//   GET  /api/retiradas/:aluguelId/status  (consulta o status das duas partes)
// e o polling abaixo deve ser trocado por WebSocket ou por esse GET periódico.

const RetiradaVizin = (function () {
    const CHAVE = "vizin_retiradas_status";

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

    // Retorna o status de uma retirada específica:
    // { locatario: { enviado, quantidade, fotos: [base64,...] }, proprietario: {...}, concluidoEm }
    function obterStatus(aluguelId) {
        const tudo = lerTudo();
        return tudo[aluguelId] || estadoInicial();
    }

    // Marca que uma das partes ("locatario" ou "proprietario") enviou suas fotos.
    // PONTO DE INTEGRAÇÃO COM O BACK-END:
    // Aqui guardamos as fotos já comprimidas em base64 só pra dar pra visualizar
    // no Histórico sem back-end. Em produção, o back-end deve receber as fotos
    // originais (multipart) e devolver URLs, e o Histórico deve consumir essas
    // URLs em vez de base64 salvo no localStorage.
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

window.RetiradaVizin = RetiradaVizin;