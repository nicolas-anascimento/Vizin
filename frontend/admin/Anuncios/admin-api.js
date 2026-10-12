/**
 * admin-api.js
 * ------------------------------------------------------------------
 * Chamadas do admin pra rotas de moderação de anúncios.
 *
 * O domínio persistido possui disponibilidade booleana e arquivamento.
 * Não há estados fictícios de remoção, aprovação ou banimento do objeto.
 * ------------------------------------------------------------------
 */

async function listarAnunciosAdmin({ busca = '', status = 'todos', pagina = 1, porPagina = 25 } = {}) {
    const params = new URLSearchParams({ page: String(pagina), limit: String(porPagina) });
    if (busca) params.set('busca', busca);
    if (status !== 'todos') params.set('status', status); // 'ativo' | 'arquivado'
    return apiRequest(`/admin/objetos?${params}`, 'GET', null, 'Não foi possível carregar objetos.');
}

async function obterAnuncioAdmin(id) {
    // O detalhe público canônico já permite que um admin autenticado veja itens arquivados.
    return apiRequest(`/objetos/${encodeURIComponent(id)}`, 'GET', null, 'Não foi possível carregar o objeto.');
}

// Traduz bloqueios de locação/solicitação sem alterar sua semântica.
function traduzirErroAnuncioAdmin(erro) {
    if (erro.status === 404) {
        return new Error('Este anúncio não existe mais ou foi alterado por outro administrador. Atualize a lista e tente de novo.');
    }
    if (erro.status === 409) {
        const codigo = String(erro.codigo || erro.message || '');
        if (/locacao/i.test(codigo)) {
            return new Error('Este anúncio está em locação ativa no momento e não pode ser removido.');
        }
        if (/pendente/i.test(codigo)) {
            return new Error('Este anúncio tem uma solicitação pendente e não pode ser removido agora.');
        }
    }
    return erro;
}

async function alterarVisibilidadeAnuncioAdmin(id, disponivel, motivo = '') {
    try {
        return await apiRequest(
            `/admin/objetos/${encodeURIComponent(id)}`,
            'PATCH',
            { disponivel, ...(motivo ? { motivo } : {}) },
            'Não foi possível moderar o objeto.'
        );
    } catch (erro) {
        throw traduzirErroAnuncioAdmin(erro);
    }
}

// ================= AVALIAÇÕES (só leitura, pro admin analisar o anúncio) =================
// Reaproveita a mesma rota pública paginada que avaliacoes-shared.js usa
// (obterAvaliacoesDoProduto: GET /objetos/:id/avaliacoes?page=&limit=), mas
// com o cliente `apiRequest` do admin, que não expõe cabeçalhos de resposta.
// Por isso a paginação aqui é feita pelo tamanho da página (para de buscar
// quando a página vier com menos itens que o limite) em vez de
// X-Total-Count — mesmo resultado, sem precisar mudar o api.js do admin.
async function obterAvaliacoesAnuncioAdmin(id) {
    const LIMITE = 100;
    let pagina = 1;
    let linhas = [];
    let paginaAtual;
    do {
        paginaAtual = await apiRequest(
            `/objetos/${encodeURIComponent(id)}/avaliacoes?page=${pagina}&limit=${LIMITE}`,
            'GET',
            null,
            'Não foi possível carregar as avaliações deste objeto.'
        );
        if (!Array.isArray(paginaAtual)) throw new Error('Resposta de avaliações inválida.');
        linhas = linhas.concat(paginaAtual);
        pagina++;
    } while (paginaAtual.length === LIMITE);

    const lista = linhas.map(r => ({
        ...r,
        data: r.criado_em,
        nomeAvaliador: r.nomeAvaliador || 'Usuário'
    }));
    const media = lista.length ? lista.reduce((s, r) => s + Number(r.nota), 0) / lista.length : 0;
    return { media, total: lista.length, lista };
}

async function arquivarAnuncioAdmin(id, motivo) {
    try {
        return await apiRequest(
            `/admin/objetos/${encodeURIComponent(id)}`,
            'DELETE',
            { motivo },
            'Não foi possível arquivar o objeto.'
        );
    } catch (erro) {
        throw traduzirErroAnuncioAdmin(erro);
    }
}