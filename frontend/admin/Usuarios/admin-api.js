async function listarUsuariosAdmin({ busca = '', status = 'todos', pagina = 1, porPagina = 25 } = {}) {
    const params = new URLSearchParams({ page: String(pagina), limit: String(porPagina) });
    if (busca) params.set('busca', busca);
    if (status !== 'todos') params.set('status', status);
    return apiRequest(`/admin/usuarios?${params}`, 'GET', null, 'Não foi possível carregar usuários.');
}
async function buscarUsuarioAdminPorId(id) {
    return apiRequest(`/admin/usuarios/${encodeURIComponent(id)}`, 'GET', null, 'Não foi possível carregar o usuário.');
}
// motivo: obrigatório ao suspender (status 'inativo'); o back guarda em
// motivo_suspensao, devolve em /usuarios/me e manda na notificação bloqueio_conta.
async function alterarStatusUsuarioAdmin(id, status, motivo = '') {
    const corpo = { ativo: status === 'ativo' };
    if (status !== 'ativo') corpo.motivo = String(motivo || '').trim();
    return apiRequest(`/admin/usuarios/${encodeURIComponent(id)}/status`, 'PATCH', corpo, 'Não foi possível alterar o status.');
}
async function excluirUsuarioAdmin(id) {
    return apiRequest(`/admin/usuarios/${encodeURIComponent(id)}`, 'DELETE', null, 'Não foi possível excluir o usuário.');
}