/**
 * notificacoes-api.js (admin)
 * ------------------------------------------------------------------
 * Chamadas do admin pra central de notificações. Contrato completo
 * (tipos, payloads, regras de geração) em NOTIFICACOES-ADMIN-BACKEND.md.
 *
 *   GET    /admin/notificacoes?page=&limit=&categoria=&lida=&prioridade=&busca=
 *            -> { data: [...], total }
 *   GET    /admin/notificacoes/resumo
 *            -> { nao_lidas, urgentes_nao_lidas, recebidas_hoje, por_categoria: {...} }
 *   PATCH  /admin/notificacoes/:id            body: { lida: true|false }
 *   POST   /admin/notificacoes/marcar-todas   body: { categoria? }  -> { atualizadas }
 *   POST   /admin/notificacoes/:id/dispensar  -> some só pro admin logado
 *
 * Estado de lida/dispensada é POR ADMIN (um admin ler/dispensar não apaga o
 * alerta do outro). Quem tratou o item aparece em `tratada_por`/`tratada_em`.
 * Preferências por admin: GET/PUT /admin/notificacoes/preferencias
 * (usadas em Configurações -> Notificações; ver preferencias-notificacoes.js).
 *
 * Cada item de `data`:
 *   {
 *     id, tipo, prioridade: 'normal' | 'alta',
 *     categoria: 'usuarios'|'anuncios'|'denuncias'|'pagamentos'|'avaliacoes'|'verificacoes'|'sistema',
 *     titulo, mensagem, lida, criado_em,
 *     referencia: { tipo: 'usuario'|'objeto'|'ocorrencia'|'pagamento'|'avaliacao'|'verificacao', id } | null,
 *     tratada_por: { id, nome } | null, tratada_em: ISO | null
 *   }
 * ------------------------------------------------------------------
 */

async function listarNotificacoesAdmin({ categoria = 'todas', lida = 'todas', prioridade = 'todas', busca = '', pagina = 1, porPagina = 15 } = {}) {
    const params = new URLSearchParams({ page: String(pagina), limit: String(porPagina) });
    if (categoria !== 'todas') params.set('categoria', categoria);
    if (lida !== 'todas') params.set('lida', lida === 'lidas' ? 'true' : 'false');
    if (prioridade !== 'todas') params.set('prioridade', prioridade);
    if (busca) params.set('busca', busca);
    return apiRequest(`/admin/notificacoes?${params}`, 'GET', null, 'Não foi possível carregar as notificações.');
}

async function obterResumoNotificacoesAdmin() {
    return apiRequest('/admin/notificacoes/resumo', 'GET', null, 'Não foi possível carregar o resumo de notificações.');
}

async function alterarLeituraNotificacaoAdmin(id, lida) {
    return apiRequest(`/admin/notificacoes/${encodeURIComponent(id)}`, 'PATCH', { lida }, 'Não foi possível atualizar a notificação.');
}

async function marcarTodasNotificacoesAdminLidas(categoria = 'todas') {
    const corpo = categoria !== 'todas' ? { categoria } : {};
    return apiRequest('/admin/notificacoes/marcar-todas', 'POST', corpo, 'Não foi possível marcar as notificações como lidas.');
}

// Dispensar = esconder SÓ pra quem clicou (a notificação continua existindo pros outros admins).
async function dispensarNotificacaoAdmin(id) {
    return apiRequest(`/admin/notificacoes/${encodeURIComponent(id)}/dispensar`, 'POST', null, 'Não foi possível dispensar a notificação.');
}