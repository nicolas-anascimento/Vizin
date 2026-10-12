/**
 * avaliacoes-api.js (admin)
 * ------------------------------------------------------------------
 * ATENÇÃO — SUPOSIÇÕES QUE PRECISAM SER CONFIRMADAS COM O BACK:
 *
 * 1. Não existe (pelos arquivos que você me mandou) uma rota geral de
 *    avaliações pro admin. Assumi:
 *
 *      GET /admin/avaliacoes?page=&limit=&nota=&busca=
 *        -> array paginado (mesmo padrão de /admin/usuarios e /admin/objetos),
 *           cada item no formato:
 *           {
 *             id, nota, comentario, criado_em, oculta,
 *             avaliador: { id, nome },
 *             avaliado:  { id, nome },
 *             produtoTitulo, aluguel_id
 *           }
 *
 *    Aqui eu ignoro os filtros de nota/busca da API (não sei se ela suporta)
 *    e busco TODAS as páginas, porque preciso da lista completa pra calcular
 *    nota média / total / distribuição no front (conforme você confirmou).
 *    Filtro e busca são aplicados depois, em avaliacoes.js.
 *
 * 2. "Ocultar" (reversível) e "Excluir" (permanente) são duas ações
 *    diferentes, ambas notificando quem fez a avaliação, motivo obrigatório
 *    só na exclusão. Assumi:
 *
 *      PATCH /admin/avaliacoes/:id   body: { oculta: true|false, motivo? }
 *      DELETE /admin/avaliacoes/:id  body: { motivo }
 *
 *    Se a semântica real for outra (ex: só existe exclusão, sem ocultar),
 *    me avisa que eu ajusto rápido.
 * ------------------------------------------------------------------
 */

async function listarAvaliacoesAdmin() {
    // Mesma técnica de paginação por tamanho de página usada em
    // obterAvaliacoesAnuncioAdmin (anuncios admin-api.js): o apiRequest do
    // admin não expõe cabeçalhos de resposta, então paramos quando a página
    // vier com menos itens que o limite.
    const LIMITE = 100;
    let pagina = 1;
    let linhas = [];
    let paginaAtual;
    do {
        paginaAtual = await apiRequest(
            `/admin/avaliacoes?page=${pagina}&limit=${LIMITE}`,
            'GET',
            null,
            'Não foi possível carregar as avaliações.'
        );
        const itens = Array.isArray(paginaAtual) ? paginaAtual : (paginaAtual?.data || paginaAtual?.dados);
        if (!Array.isArray(itens)) throw new Error('Resposta de avaliações inválida.');
        linhas = linhas.concat(itens);
        pagina++;
    } while ((Array.isArray(paginaAtual) ? paginaAtual.length : (paginaAtual?.data || paginaAtual?.dados || []).length) === LIMITE);

    return linhas.map(normalizarAvaliacaoAdmin);
}

function normalizarAvaliacaoAdmin(r) {
    return {
        id: String(r.id),
        avaliadorId: r.avaliador?.id ? String(r.avaliador.id) : null,
        avaliadorNome: r.avaliador?.nome || 'Usuário',
        avaliadoId: r.avaliado?.id ? String(r.avaliado.id) : null,
        avaliadoNome: r.avaliado?.nome || 'Usuário',
        produtoTitulo: r.produtoTitulo || r.produto?.titulo || '',
        aluguelId: r.aluguel_id ? String(r.aluguel_id) : null,
        nota: Number(r.nota),
        comentario: r.comentario || '',
        data: r.criado_em,
        oculta: !!r.oculta
    };
}

// oculta: true para ocultar, false para reexibir. motivo só é enviado
// quando informado (ao reexibir não faz sentido pedir motivo).
async function alterarVisibilidadeAvaliacaoAdmin(id, oculta, motivo = '') {
    return apiRequest(
        `/admin/avaliacoes/${encodeURIComponent(id)}`,
        'PATCH',
        { oculta, ...(motivo ? { motivo } : {}) },
        'Não foi possível alterar a visibilidade da avaliação.'
    );
}

async function excluirAvaliacaoAdmin(id, motivo) {
    return apiRequest(
        `/admin/avaliacoes/${encodeURIComponent(id)}`,
        'DELETE',
        { motivo },
        'Não foi possível excluir a avaliação.'
    );
}
