async function listarAnunciosAdmin({ status = 'todos', pagina = 1, porPagina = 25 } = {}) {
    const params = new URLSearchParams({ page: String(pagina), limit: String(porPagina) });
    if (status !== 'todos') params.set('status', status === 'arquivado' ? 'arquivado' : 'ativo');
    return apiRequest(`/admin/objetos?${params}`, 'GET', null, 'Não foi possível carregar objetos.');
}
async function alterarStatusAnuncioAdmin(id, status, motivo = '') {
    return apiRequest(`/admin/objetos/${encodeURIComponent(id)}`, 'PATCH', { disponivel: status === 'ativo', ...(motivo ? { motivo } : {}) }, 'Não foi possível moderar o objeto.');
}
async function excluirAnuncioAdmin(id, motivo) {
    return apiRequest(`/admin/objetos/${encodeURIComponent(id)}`, 'DELETE', { motivo }, 'Não foi possível arquivar o objeto.');
}
