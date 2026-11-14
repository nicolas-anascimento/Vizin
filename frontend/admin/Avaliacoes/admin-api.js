/**
 * admin-api.js (Avaliacoes)
 * ------------------------------------------------------------------
 * ATENÇÃO — SUPOSIÇÕES A CONFIRMAR COM O BACK (não vi rota geral de
 * avaliações nos admin-api.js de Anúncios/Usuários que você mandou):
 *
 *   GET /admin/avaliacoes?page=&limit=
 *     -> array paginado, cada item:
 *        {
 *          id, nota, comentario, criado_em, oculta,
 *          avaliador: { id, nome },
 *          avaliado:  { id, nome },
 *          produtoTitulo, aluguel_id
 *        }
 *
 *   PATCH /admin/avaliacoes/:id  body: { oculta: true|false, motivo? }
 *     -> oculta (reversível, some das estatísticas/exibição pública) ou
 *        reexibe a avaliação.
 *
 *   DELETE /admin/avaliacoes/:id  body: { motivo }
 *     -> exclui permanentemente. Precisa notificar as DUAS partes (igual
 *        confirmado por você): quem ESCREVEU a avaliação (tipo
 *        avaliacao_ocultada_admin/avaliacao_removida_admin) e quem foi
 *        AVALIADO por ela, já que a nota dele muda (tipo
 *        avaliacao_sobre_voce_ocultada_admin/avaliacao_sobre_voce_removida_admin
 *        — ver notificacoes-shared.js). Nenhum desses 4 tipos existe no
 *        back ainda.
 *
 * Busco TODAS as páginas (mesma técnica de paginação por tamanho de página
 * usada em obterAvaliacoesAnuncioAdmin, já que apiRequest do admin não
 * expõe cabeçalhos de resposta), porque a nota média / total / distribuição
 * são calculadas no front sobre a lista completa.
 * ------------------------------------------------------------------
 */

async function listarAvaliacoesAdmin() {
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
    } while ((Array.isArray(paginaAtual) ? paginaAtual : (paginaAtual?.data || paginaAtual?.dados || [])).length === LIMITE);

    // Mais recentes primeiro — mesmo padrão usado em solicitacoes-shared.js
    // e notificacoes.js (ids são UUID, então a ordem vem sempre da data).
    return linhas
        .map(normalizarAvaliacaoAdmin)
        .sort((a, b) => String(b.data || "").localeCompare(String(a.data || "")));
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
