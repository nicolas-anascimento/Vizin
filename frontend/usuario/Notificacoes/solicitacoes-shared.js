/* =====================================================
   SOLICITAÇÕES VIZIN — MÓDULO COMPARTILHADO (API REAL)
   -----------------------------------------------------
   Antes: mock em localStorage, com ids numéricos, lembretes/prazos
   rodando no navegador e notificações criadas aqui.
   Agora: o back-end é a fonte da verdade. Este módulo só

     1. busca as solicitações do usuário logado (como locatário e como
        proprietário) e mantém uma CÓPIA EM MEMÓRIA (cache) — assim as
        leituras continuam síncronas (obterPorId, obterTodas...) e as
        páginas não precisam virar assíncronas em todo lugar;
     2. traduz o DTO da API (snake_case, status do banco) pro formato
        que as telas já usavam (camelCase, status "rejeitado"/"concluido");
     3. expõe as AÇÕES (criar, responder, cancelar, contestarMulta) como
        funções assíncronas que chamam o back e depois atualizam o cache.

   COMO USAR NAS PÁGINAS
     - Leitura no carregamento: `await SolicitacoesVizin.pronto` antes de
       ler (obterPorId/obterTodas...). Depois disso as leituras são síncronas.
     - Reagir a mudanças: escutar o evento "solicitacoesAtualizadas" (disparado
       quando o cache muda — polling a cada 30 s + após cada ação).
     - Ações: sempre `await` e tratar `erro.codigo` (ver códigos abaixo).

   O QUE SAIU DAQUI (agora é do servidor)
     - lembretes de retirada/devolução, aviso de atraso, expiração de
       pendências/prazos, cancelamento por não pagamento/não retirada;
     - criação de notificações (o back gera todas);
     - cálculo de multa e de bloqueio (vêm do back);
     - marcarDisponibilidade do objeto (o back controla as reservas);
     - atualizarStatus (retirado/concluído/pago mudam por eventos do back).

   Identificação das partes: por ID (UUID), nunca por e-mail. Cada
   solicitação traz `souProprietario` / `souSolicitante` já calculados
   para o usuário logado.
   ===================================================== */

(function () {
    "use strict";

    if (!window.ApiVizin) {
        console.error("utils/api-client.js (e utils/config.js) precisam ser carregados ANTES deste script. Rode aplicar-scripts-html.py.");
        return;
    }

    const Api = window.ApiVizin;
    const enc = encodeURIComponent;

    // O back guarda "recusado" / "devolvido" / "finalizado"; as telas falam
    // "rejeitado" / "concluido". statusApi preserva a distinção entre
    // devolução registrada e finalização para telas que precisem dela.
    // "aguardando_devolucao" NÃO existe mais como
    // estado (é progresso derivado das fotos de devolução): aqui vira "retirado".
    const STATUS_API_PARA_UI = {
        recusado: "rejeitado",
        devolvido: "concluido",
        finalizado: "concluido"
    };

    const STATUS_CANCELAVEIS = new Set(["pendente", "aprovado", "pago"]);

    let usuarioId = null;
    let bloqueio = null;
    let cache = new Map();
    let ultimaAssinatura = null;
    let atualizando = null;

    // ================= IDENTIDADE =================
    async function carregarIdentidade() {
        if (usuarioId) return usuarioId;
        const me = await Api.get("/usuarios/me");
        const id = me?.id ?? me?.usuario?.id ?? null;
        usuarioId = id ? String(id) : null;
        return usuarioId;
    }

    // ================= NORMALIZAÇÃO DO DTO =================
    function normalizarMulta(m) {
        if (!m) return null;
        return {
            status: m.status || null,                       // pendente | paga | contestada
            diasAtraso: Number(m.dias_atraso ?? 0),
            valorDia: Number(m.valor_dia ?? 0),
            valorTotal: Number(m.valor_total ?? 0),
            valorPlataforma: Number(m.valor_plataforma ?? 0),
            valorProprietario: Number(m.valor_proprietario ?? 0),
            calculadoEm: m.calculado_em || null,
            pagaEm: null // o DTO da solicitação não publica a data de pagamento
        };
    }

    function normalizar(dto) {
        const multa = normalizarMulta(dto.multa);
        const foiPago = Array.isArray(dto.pagamentos)
            && dto.pagamentos.some(p => ["pago", "estornado"].includes(p?.status));

        const s = {
            id: String(dto.id),
            status: STATUS_API_PARA_UI[dto.status] || dto.status,
            statusApi: dto.status,

            produtoId: dto.produto?.id ?? null,
            produtoTitulo: dto.produto?.titulo || "",
            produtoCategoria: dto.produto?.categoria || "",
            imagemProduto: dto.produto?.imagem || null,

            proprietarioId: dto.proprietario?.id ? String(dto.proprietario.id) : null,
            proprietarioNome: dto.proprietario?.nome || "",
            solicitanteId: dto.solicitante?.id ? String(dto.solicitante.id) : null,
            solicitanteNome: dto.solicitante?.nome || "",

            dataRetirada: dto.data_retirada,
            dataDevolucao: dto.data_devolucao,
            dias: dto.dias,

            subtotal: dto.subtotal,
            taxaServico: dto.taxa_servico,
            total: dto.total, // preço contratual, já com a taxa de serviço

            canceladoPor: dto.cancelado_por || null,
            pagamentoEstornado: dto.status === "cancelado" && foiPago,
            criadaEm: dto.criadoEm || null,

            // Multa: só existe quando o back devolveu um snapshot.
            multaAtraso: multa && multa.diasAtraso > 0 ? multa : null,
            multaStatus: multa?.status || null,
            multaCongeladaEm: multa?.calculadoEm || null,
            multaPagaEm: multa?.pagaEm || null
        };

        aplicarPapel(s);
        return s;
    }

    function aplicarPapel(s) {
        s.souProprietario = !!usuarioId && s.proprietarioId === usuarioId;
        s.souSolicitante = !!usuarioId && s.solicitanteId === usuarioId;
        s.canceladoPorMim = !!usuarioId && s.canceladoPor === usuarioId;
        s.canceladoPeloSistema = s.canceladoPor === "sistema";
    }

    // ================= CARGA / ATUALIZAÇÃO =================
    function avisarMudanca() {
        document.dispatchEvent(new CustomEvent("solicitacoesAtualizadas"));
    }

    async function atualizar() {
        if (atualizando) return atualizando;

        atualizando = (async () => {
            try {
                await carregarIdentidade();

                const [comoLocatario, comoProprietario, bloqueioAtual] = await Promise.all([
                    Api.listarTodas("/solicitacoes?papel=locatario"),
                    Api.listarTodas("/solicitacoes?papel=proprietario"),
                    Api.get("/usuarios/me/bloqueio").catch(() => null)
                ]);

                const novo = new Map();
                [...comoLocatario, ...comoProprietario].forEach(dto => {
                    const s = normalizar(dto);
                    novo.set(s.id, s);
                });

                const assinatura = JSON.stringify([[...novo.values()], bloqueioAtual]);
                const mudou = assinatura !== ultimaAssinatura;

                cache = novo;
                bloqueio = bloqueioAtual;
                ultimaAssinatura = assinatura;

                if (mudou) avisarMudanca();
            } finally {
                atualizando = null;
            }
        })();

        return atualizando;
    }

    // Resolve quando a 1ª carga terminou (mesmo se falhou — não rejeita,
    // pra a página não travar; o erro vai pro console).
    const pronto = atualizar().catch(err => {
        console.error("Não foi possível carregar as solicitações:", err);
    });

    // Polling leve (substitui os timers de prazo/lembrete do navegador).
    setInterval(() => { if (!document.hidden) atualizar().catch(() => {}); }, 30 * 1000);
    document.addEventListener("visibilitychange", () => {
        if (!document.hidden) atualizar().catch(() => {});
    });

    // ================= LEITURA (síncrona, sobre o cache) =================
    function obterTodas() {
        return [...cache.values()];
    }

    function obterPorId(id) {
        if (id === null || id === undefined) return null;
        return cache.get(String(id)) || null;
    }

    // Quando o id não está no cache (ex.: abriu um link direto antes do
    // polling), busca no back e guarda.
    async function buscarPorId(id) {
        const local = obterPorId(id);
        if (local) return local;

        await carregarIdentidade();
        const dto = await Api.get(`/solicitacoes/${enc(id)}`);
        const s = normalizar(dto);
        cache.set(s.id, s);
        avisarMudanca();
        return s;
    }

    // Os parâmetros (e-mail) existiam na versão mock e são ignorados: as
    // listas são sempre do usuário logado.
    function obterDoProprietario() {
        return obterTodas().filter(s => s.souProprietario);
    }

    function obterDoSolicitante() {
        return obterTodas().filter(s => s.souSolicitante);
    }

    function contarPendentesComoProprietario() {
        return obterDoProprietario().filter(s => s.status === "pendente").length;
    }

    function podeCancelar(id) {
        const s = obterPorId(id);
        return !!s && STATUS_CANCELAVEIS.has(s.status);
    }

    // ================= BLOQUEIO POR ATRASO (regra do back) =================
    //   "devolucao_pendente" -> ainda está com um objeto cujo prazo passou
    //   "multa_pendente"     -> devolveu, mas deve uma multa não paga
    function detalhesBloqueio() {
        if (!bloqueio?.motivo) return null;
        const sid = bloqueio.solicitacao_id ? String(bloqueio.solicitacao_id) : null;
        return {
            motivo: bloqueio.motivo,
            solicitacao: (sid && cache.get(sid)) || (sid ? { id: sid } : null)
        };
    }

    function estaBloqueadoPorAtraso() {
        return !!detalhesBloqueio();
    }

    // Locações concluídas, em que sou o locatário, com multa pendente.
    function obterMultasPendentes() {
        return obterDoSolicitante().filter(s =>
            s.status === "concluido" && s.multaAtraso && s.multaStatus === "pendente"
        );
    }

    // ================= AÇÕES (assíncronas) =================
    // Erros: lançam ApiError com `codigo` e `message` (texto do back).
    //   criar:     solicitacao_duplicada, usuario_com_devolucao_pendente,
    //              usuario_com_multa_pendente, nao_encontrada, dados_invalidos
    //   responder: objeto_indisponivel, usuario_com_*, nao_pertence
    //   cancelar:  cancelamento_indisponivel, operacao_pendente, nao_pertence

    // dados = { produtoId, dataRetirada, dataDevolucao }
    // Valores, datas de cobrança e o proprietário são definidos pelo back.
    async function criar({ produtoId, dataRetirada, dataDevolucao }) {
        await carregarIdentidade();
        const dto = await Api.post("/solicitacoes", {
            produto_id: produtoId,
            data_retirada: dataRetirada,
            data_devolucao: dataDevolucao
        });
        const s = normalizar(dto);
        cache.set(s.id, s);
        avisarMudanca();
        atualizar().catch(() => {});
        return s;
    }

    // novoStatus: "aprovado" | "rejeitado"
    // Ao aprovar, o back recusa sozinho as pendentes concorrentes — por isso
    // recarregamos tudo depois.
    async function responder(id, novoStatus) {
        await Api.patch(`/solicitacoes/${enc(id)}`, { status: novoStatus });
        await atualizar();
        return obterPorId(id);
    }

    // Devolve a solicitação atualizada, com `operacaoFinanceiraPendente: true`
    // quando o back respondeu 202 (cancelamento de solicitação paga aguardando
    // confirmação do estorno pelo provedor).
    async function cancelar(id) {
        const resposta = await Api.requisitar("POST", `/solicitacoes/${enc(id)}/cancelamento`, {}, { comCabecalhos: true });
        await atualizar();
        return {
            ...(obterPorId(id) || { id: String(id) }),
            operacaoFinanceiraPendente: resposta.status === 202
        };
    }

    // ================= MULTA =================
    // Consulta a multa no back (nunca calculamos no navegador).
    // Retorna null se a locação não tem multa (codigo "sem_multa").
    async function obterMulta(id) {
        try {
            const dto = await Api.get(`/solicitacoes/${enc(id)}/multa`);
            return { ...normalizarMulta(dto), produto: dto.produto || null };
        } catch (erro) {
            if (erro.codigo === "sem_multa") return null;
            throw erro;
        }
    }

    // Só o locatário pode contestar. Suspende a cobrança e o bloqueio até o
    // Suporte decidir; o back avisa a outra parte.
    async function contestarMulta(id, descricao) {
        const r = await Api.post(`/solicitacoes/${enc(id)}/multa/contestacao`, { descricao });
        await atualizar();
        return r;
    }

    // ================= UTILITÁRIOS =================
    function formatarReal(valor) {
        return `R$ ${Number(valor).toFixed(2).replace(".", ",")}`;
    }

    window.SolicitacoesVizin = {
        pronto,
        atualizar,
        buscarPorId,
        usuarioId: () => usuarioId,

        obterTodas,
        obterPorId,
        obterDoProprietario,
        obterDoSolicitante,
        contarPendentesComoProprietario,
        podeCancelar,
        obterMultasPendentes,

        estaBloqueadoPorAtraso,
        detalhesBloqueio,

        criar,
        responder,
        cancelar,
        obterMulta,
        contestarMulta,

        formatarReal
    };
})();
