async function listarUsuariosAdmin({ pagina = 1, porPagina = 25 } = {}) {
    return apiRequest(`/admin/usuarios?page=${pagina}&limit=${porPagina}`, 'GET', null, 'Não foi possível carregar usuários.');
}
async function buscarUsuarioAdminPorId(id) {
    let pagina = 1;
    while (true) {
        const resposta = await listarUsuariosAdmin({ pagina, porPagina: 100 });
        const usuario = resposta.dados.find(u => u.id === id);
        if (usuario) return usuario;
        if (pagina >= resposta.paginas) return null;
        pagina++;
    }
}
async function alterarStatusUsuarioAdmin(id, status) {
    return apiRequest(`/admin/usuarios/${encodeURIComponent(id)}/status`, 'PATCH', { ativo: status === 'ativo' }, 'Não foi possível alterar o status.');
}
async function excluirUsuarioAdmin(id) {
    return apiRequest(`/admin/usuarios/${encodeURIComponent(id)}`, 'DELETE', null, 'Não foi possível excluir o usuário.');
}
