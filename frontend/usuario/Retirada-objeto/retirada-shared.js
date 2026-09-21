// ================= RETIRADA VIZIN — MÓDULO COMPARTILHADO (API REAL) =================
// Status de envio de fotos de cada parte (locatário / proprietário) na
// RETIRADA. Cada pessoa envia pelo próprio dispositivo; este módulo mantém
// uma cópia em memória do que o back devolveu, pra a tela saber se a outra
// parte já enviou as fotos dela.
//
// Rotas:
//   GET  /solicitacoes/:id/retirada          -> status das duas partes
//   POST /solicitacoes/:id/retirada/fotos    -> multipart: "fotos" (1–5, até 5 MB
//                                              cada) + "observacoes"
// O papel de quem envia vem do token — o front NÃO manda "papel".
// Quando as DUAS partes enviaram, o back muda o status da solicitação e gera
// as notificações sozinho (o front não atualiza status nem notifica).
// Fotos são privadas: use ApiVizin.urlBlob(caminho) pra exibi-las numa <img>.
//
// Erros (ApiError.codigo): nao_pertence, nao_encontrada, conflito (etapa fora
// do estado), dados_invalidos (tipo/tamanho/quantidade de foto).

const RetiradaVizin = (function () {
    "use strict";

    const Api = window.ApiVizin;
    const enc = encodeURIComponent;
    const cache = new Map();

    function parte(p) {
        return {
            enviado: !!p?.enviado,
            confirmado: !!p?.confirmado,
            quantidade: p?.quantidade || 0,
            fotos: p?.fotos || [],            // caminhos privados (/uploads/...)
            observacoes: p?.observacoes || "",
            enviadoEm: p?.enviado_em || null
        };
    }

    function normalizar(dto) {
        return {
            solicitacaoId: String(dto.solicitacao_id),
            status: dto.status,               // status da solicitação (fonte de verdade da etapa)
            locatario: parte(dto.locatario),
            proprietario: parte(dto.proprietario),
            concluidoEm: dto.concluido_em || null
        };
    }

    function estadoInicial(id) {
        return normalizar({ solicitacao_id: id, locatario: null, proprietario: null });
    }

    // Busca no back e guarda. Chame antes de ler (obterStatus) e em cada ciclo de polling.
    async function carregar(aluguelId) {
        const dto = await Api.get(`/solicitacoes/${enc(aluguelId)}/retirada`);
        const estado = normalizar(dto);
        cache.set(String(aluguelId), estado);
        return estado;
    }

    // Leitura síncrona da última carga (estado "nada enviado" se ainda não carregou).
    function obterStatus(aluguelId) {
        return cache.get(String(aluguelId)) || estadoInicial(aluguelId);
    }

    // fotos: array de File/Blob (imagem). Devolve o status já atualizado.
    async function enviarFotos(aluguelId, { fotos, observacoes }) {
        const form = new FormData();
        (fotos || []).forEach((arquivo, i) => form.append("fotos", arquivo, arquivo.name || `foto-${i + 1}.jpg`));
        if (observacoes) form.append("observacoes", observacoes);

        await Api.post(`/solicitacoes/${enc(aluguelId)}/retirada/fotos`, form);
        return carregar(aluguelId);
    }

    function ambosConcluidos(aluguelId) {
        const s = obterStatus(aluguelId);
        return s.locatario.enviado && s.proprietario.enviado;
    }

    return { carregar, obterStatus, enviarFotos, ambosConcluidos };
})();

window.RetiradaVizin = RetiradaVizin;
