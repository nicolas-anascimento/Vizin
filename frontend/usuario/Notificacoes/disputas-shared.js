/* =====================================================
   DISPUTAS VIZIN — MÓDULO COMPARTILHADO (API REAL)
   -----------------------------------------------------
   Relatos de problema na retirada, na devolução ou na multa (objeto
   diferente do anúncio, chegou danificado, a outra parte não aparece...).

   Rotas:
     POST /relatos                     { solicitacao_id, etapa, motivo, descricao }
     GET  /solicitacoes/:id/relatos    -> lista (autor_id, status, resposta_usuario, criado_em)

   O back reaproveita o sistema de denúncias do Suporte, AVISA A OUTRA PARTE
   (notificação "problema_reportado" ou "multa_contestada") e devolve o
   mesmo relato se o mesmo autor repetir aluguel + etapa + motivo (retry).
   Este módulo NÃO cria notificações.

   Erros (ApiError.codigo): nao_pertence, nao_encontrada, etapa_indisponivel,
   sem_multa, relato_invalido, dados_invalidos.
   ===================================================== */

const DisputasVizin = (function () {
    "use strict";

    const Api = window.ApiVizin;
    const enc = encodeURIComponent;

    const MOTIVOS_LABEL = {
        objeto_diferente: "O objeto não é como no anúncio",
        objeto_danificado: "O objeto chegou danificado",
        objeto_incompleto: "Faltam peças/acessórios do objeto",
        outra_parte_ausente: "A outra parte não apareceu / não responde",
        multa_indevida: "A multa por atraso não deveria ser cobrada de mim",
        outro: "Outro motivo"
    };

    // etapa = "retirada" | "devolucao" | "multa"
    async function abrirRelato({ aluguelId, etapa, motivo, descricao }) {
        return Api.post("/relatos", {
            solicitacao_id: aluguelId,
            etapa,
            motivo,
            descricao: descricao || ""
        });
    }

    async function obterTodosPorAluguel(aluguelId) {
        const lista = await Api.get(`/solicitacoes/${enc(aluguelId)}/relatos`);
        return Array.isArray(lista) ? lista : [];
    }

    // Relato mais recente e ainda em aberto para esse aluguel/etapa — qualquer
    // uma das partes pode ter aberto; a tela mostra pra ambas.
    async function obterRelatoAberto(aluguelId, etapa) {
        const todos = await obterTodosPorAluguel(aluguelId);
        return todos.find(r => r.etapa === etapa && r.status !== "resolvido" && r.status !== "fechada") || null;
    }

    return { abrirRelato, obterRelatoAberto, obterTodosPorAluguel, MOTIVOS_LABEL };
})();

window.DisputasVizin = DisputasVizin;