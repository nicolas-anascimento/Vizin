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
