/**
 * auditoria-api.js (admin)
 * ------------------------------------------------------------------
 * Histórico de ações dos administradores (log de auditoria).
 *
 *   GET /admin/auditoria?page=&limit=&categoria=&busca=&de=&ate=
 *     -> { data: [...], total }
 *     categoria: usuarios | anuncios | avaliacoes | denuncias | verificacoes | categorias | notificacoes
 *     de / ate:  AAAA-MM-DD (inclusive, fuso America/Sao_Paulo)
 *     busca:     nome do admin, rótulo do alvo ou motivo
 *     cada item:
 *       {
 *         id, criado_em, acao, categoria,
 *         admin: { id, nome },
 *         alvo: { tipo: 'usuario'|'objeto'|'avaliacao'|'ocorrencia'|'verificacao'|null, id: string|null, rotulo: string },
 *         motivo: string | null
 *       }
 *
 * Somente leitura: não existe rota para editar ou apagar entradas.
 * Contrato completo em NOTIFICACOES-ADMIN-BACKEND.md (seção "Histórico de ações").
 * ------------------------------------------------------------------
 */
async function listarAuditoriaAdmin({ busca = '', categoria = 'todas', de = '', ate = '', pagina = 1, porPagina = 25 } = {}) {
    const params = new URLSearchParams({ page: String(pagina), limit: String(porPagina) });
    if (busca) params.set('busca', busca);
    if (categoria !== 'todas') params.set('categoria', categoria);
    if (de) params.set('de', de);
    if (ate) params.set('ate', ate);
    return apiRequest(`/admin/auditoria?${params}`, 'GET', null, 'Não foi possível carregar o histórico de ações.');
}