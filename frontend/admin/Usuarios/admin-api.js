async function listarUsuariosAdmin({ busca = '', status = 'todos', pagina = 1, porPagina = 25 } = {}) {
    const params = new URLSearchParams({ page: String(pagina), limit: String(porPagina) });
    if (busca) params.set('busca', busca);
    if (status !== 'todos') params.set('status', status);
    return apiRequest(`/admin/usuarios?${params}`, 'GET', null, 'Não foi possível carregar usuários.');
}
async function buscarUsuarioAdminPorId(id) {
    return apiRequest(`/admin/usuarios/${encodeURIComponent(id)}`, 'GET', null, 'Não foi possível carregar o usuário.');
}
async function alterarStatusUsuarioAdmin(id, status) {
    return apiRequest(`/admin/usuarios/${encodeURIComponent(id)}/status`, 'PATCH', { ativo: status === 'ativo' }, 'Não foi possível alterar o status.');
}
async function excluirUsuarioAdmin(id) {
    return apiRequest(`/admin/usuarios/${encodeURIComponent(id)}`, 'DELETE', null, 'Não foi possível excluir o usuário.');
}
