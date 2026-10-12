// ================= DEVOLUÇÃO VIZIN — MÓDULO COMPARTILHADO (API REAL) =================
// Status de envio de fotos de cada parte (locatário / proprietário) na
// DEVOLUCAO. Cada pessoa envia pelo próprio dispositivo; este módulo mantém
// uma cópia em memória do que o back devolveu, pra a tela saber se a outra
// parte já enviou as fotos dela.
//
// Rotas:
//   GET  /solicitacoes/:id/devolucao          -> status das duas partes
//   POST /solicitacoes/:id/devolucao/fotos    -> multipart: "fotos" (1–5, até 5 MB
//                                              cada) + "observacoes" (+ "danos" opcional)
// O papel de quem envia vem do token — o front NÃO manda "papel".
// Quando as DUAS partes enviaram, o back muda o status da solicitação e gera
// as notificações sozinho (o front não atualiza status nem notifica).
// Fotos são privadas: use ApiVizin.urlBlob(caminho) pra exibi-las numa <img>.
//
// Erros (ApiError.codigo): nao_pertence, nao_encontrada, conflito (etapa fora
// do estado), dados_invalidos (tipo/tamanho/quantidade de foto).

const DevolucaoVizin = (function () {
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
            danos: p?.danos || null,
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
        const dto = await Api.get(`/solicitacoes/${enc(aluguelId)}/devolucao`);
        const estado = normalizar(dto);
        cache.set(String(aluguelId), estado);
        return estado;
    }

    // Leitura síncrona da última carga (estado "nada enviado" se ainda não carregou).
    function obterStatus(aluguelId) {
        return cache.get(String(aluguelId)) || estadoInicial(aluguelId);
    }

    // fotos: array de File/Blob (imagem). Devolve o status já atualizado.
    async function enviarFotos(aluguelId, { fotos, observacoes, danos }) {
        const form = new FormData();
        (fotos || []).forEach((arquivo, i) => form.append("fotos", arquivo, arquivo.name || `foto-${i + 1}.jpg`));
        if (observacoes) form.append("observacoes", observacoes);
        if (danos) form.append("danos", danos);

        await Api.post(`/solicitacoes/${enc(aluguelId)}/devolucao/fotos`, form);
        return carregar(aluguelId);
    }

    function ambosConcluidos(aluguelId) {
        const s = obterStatus(aluguelId);
        return s.locatario.enviado && s.proprietario.enviado;
    }


    // ================= PRAZO DA DEVOLUÇÃO (regra única, usada nas duas telas) =================
    // REGRA: a devolução vai até as 23:59 do dia agendado (fuso de São Paulo).
    // A partir das 00:00 do dia seguinte a devolução está em atraso e conta
    // multa diária (1 dia de atraso = 1ª diária). Quem cobra é o back; aqui só
    // exibimos. O "dia de hoje" é calculado em America/Sao_Paulo (e não no fuso
    // do aparelho), pra a tela concordar com a regra do back.
    const FUSO = "America/Sao_Paulo";

    function partesAgora() {
        const partes = new Intl.DateTimeFormat("en-CA", {
            timeZone: FUSO, hourCycle: "h23",
            year: "numeric", month: "2-digit", day: "2-digit",
            hour: "2-digit", minute: "2-digit", second: "2-digit"
        }).formatToParts(new Date());
        const o = {};
        partes.forEach(x => { o[x.type] = x.value; });
        return o;
    }

    function hojeISO() {
        const p = partesAgora();
        return `${p.year}-${p.month}-${p.day}`;
    }

    function diasEntre(isoDe, isoAte) {
        const [a1, m1, d1] = isoDe.split("-").map(Number);
        const [a2, m2, d2] = isoAte.split("-").map(Number);
        return Math.round((Date.UTC(a2, m2 - 1, d2) - Date.UTC(a1, m1 - 1, d1)) / 86400000);
    }

    // dataISO: "aaaa-mm-dd" (dia agendado da devolução).
    // estado: "futura" (antes do dia), "hoje" (até 23:59 de hoje) ou "atrasada".
    // diff: dias que faltam (negativo = dias de atraso). diasAtraso: 0 se no prazo.
    function prazo(dataISO) {
        if (!dataISO || !/^\d{4}-\d{2}-\d{2}/.test(dataISO)) return null;
        const dia = dataISO.slice(0, 10);
        const diff = diasEntre(hojeISO(), dia);
        return {
            dataISO: dia,
            diff,
            diasAtraso: diff < 0 ? -diff : 0,
            estado: diff > 0 ? "futura" : diff === 0 ? "hoje" : "atrasada"
        };
    }

    function estaAtrasada(dataISO) {
        const p = prazo(dataISO);
        return !!p && p.estado === "atrasada";
    }

    // Chama cb() logo depois de cada meia-noite (São Paulo). Serve pra tela
    // mudar sozinha de "hoje" pra "em atraso" sem precisar recarregar.
    function aoVirarODia(cb) {
        const p = partesAgora();
        const segundosRestantes = (23 - Number(p.hour)) * 3600 + (59 - Number(p.minute)) * 60 + (60 - Number(p.second));
        setTimeout(() => {
            try { cb(); } catch (e) { console.error(e); }
            aoVirarODia(cb);
        }, segundosRestantes * 1000 + 1500);
    }

    return { carregar, obterStatus, enviarFotos, ambosConcluidos, prazo, estaAtrasada, aoVirarODia };
})();

window.DevolucaoVizin = DevolucaoVizin;