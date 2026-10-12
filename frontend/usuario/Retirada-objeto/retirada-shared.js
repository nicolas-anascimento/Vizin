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
// do estado), dados_invalidos (tipo/tamanho/quantidade de foto),
// retirada_data_futura (ainda não é o dia da retirada) e
// retirada_prazo_expirado (passou das 23:59 do dia da retirada).
//
// JANELA DA RETIRADA: só pode ser registrada NO DIA agendado, das 00:00 às
// 23:59 (fuso America/Sao_Paulo). O back é quem decide e informa isso em
// "codigo_bloqueio" (GET) e nos erros acima (POST). janela() abaixo traduz
// isso pra as telas e, se o back não informou nada, cai num cálculo local
// (sempre no fuso de São Paulo, nunca no do aparelho).

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
            dataRetirada: dto.data_retirada || null,
            codigoBloqueio: dto.codigo_bloqueio || null,
            modoDemo: dto.modo_demo === true,
            retiradaDemoLiberada: dto.retirada_demo_liberada === true,
            podeLiberarRetiradaDemo: dto.pode_liberar_retirada_demo === true,
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

    async function liberarRetiradaDemo(aluguelId) {
        await Api.post(`/solicitacoes/${enc(aluguelId)}/retirada/demo`, {});
        return carregar(aluguelId);
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

    // ---------- Janela da retirada (00:00–23:59 do dia agendado) ----------
    const FUSO_RETIRADA = "America/Sao_Paulo";

    // "aaaa-mm-dd" de HOJE no fuso de São Paulo (não depende do fuso do aparelho).
    function hojeISO() {
        try {
            return new Intl.DateTimeFormat("en-CA", {
                timeZone: FUSO_RETIRADA, year: "numeric", month: "2-digit", day: "2-digit"
            }).format(new Date());
        } catch (e) {
            const d = new Date();
            return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
        }
    }

    // Diferença em dias inteiros entre duas datas "aaaa-mm-dd" (ate - de).
    function diasEntreISO(deISO, ateISO) {
        const [a1, m1, d1] = deISO.split("-").map(Number);
        const [a2, m2, d2] = ateISO.split("-").map(Number);
        if ([a1, m1, d1, a2, m2, d2].some(Number.isNaN)) return null;
        return Math.round((Date.UTC(a2, m2 - 1, d2) - Date.UTC(a1, m1 - 1, d1)) / 86400000);
    }

    // Estado da janela da retirada:
    //   "futura"   -> ainda não é o dia (abre às 00:00 do dia agendado)
    //   "aberta"   -> é o dia agendado (vai até 23:59) ou a demo liberou
    //   "expirada" -> passou das 23:59 do dia agendado
    // Prioridade: demo liberada > codigo_bloqueio do back > data (São Paulo).
    // diff = dias entre hoje e a data agendada (>0 futura, 0 hoje, <0 passou),
    // ou null se não há data.
    function janela(aluguelId, dataFallback) {
        const st = obterStatus(aluguelId);
        const dataISO = String(st.dataRetirada || dataFallback || "").slice(0, 10);
        const diff = dataISO ? diasEntreISO(hojeISO(), dataISO) : null;

        let estado;
        if (st.modoDemo && st.retiradaDemoLiberada) estado = "aberta";
        else if (st.codigoBloqueio === "retirada_data_futura") estado = "futura";
        else if (st.codigoBloqueio === "retirada_prazo_expirado") estado = "expirada";
        else if (diff === null) estado = "aberta";
        else estado = diff > 0 ? "futura" : diff < 0 ? "expirada" : "aberta";

        return { estado, dataISO, diff };
    }

    function ambosConcluidos(aluguelId) {
        const s = obterStatus(aluguelId);
        return s.locatario.enviado && s.proprietario.enviado;
    }

    return { carregar, liberarRetiradaDemo, obterStatus, enviarFotos, ambosConcluidos, janela };
})();

window.RetiradaVizin = RetiradaVizin;