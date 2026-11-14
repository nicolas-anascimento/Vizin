/**
 * denuncias-api.js (admin)
 * ------------------------------------------------------------------
 * ATENÇÃO — SUPOSIÇÕES A CONFIRMAR COM O BACK (mesmo aviso já usado no
 * admin-api.js de Avaliações: não existe ainda uma rota geral pra isso):
 *
 *   GET /admin/ocorrencias?page=&limit=&busca=&tipo=&status=&prioridade=&denunciado_id=
 *     (denunciado_id = UUID do denunciado; filtro e paginação no PostgreSQL — confirmado pelo back)
 *     -> { data: [...], total }   (mesmo formato de /admin/objetos e /admin/pagamentos)
 *     cada item:
 *       {
 *         id, tipo: 'denuncia' | 'suporte',
 *         denunciante: { id, nome },
 *         denunciado: { id, nome } | null,           // null quando tipo === 'suporte'
 *         motivo, descricao, prioridade, status, protocolo, criado_em,
 *         aluguel_id, produto_id, avaliacao_id, conversa_id,  // origem — no
 *           máximo um preenchido; é o que UNE denúncias vindas do
 *           formulário de Suporte (Suporte/suporte.js) e as vindas do botão
 *           "Denunciar conversa" do Mensagens (Mensagens/app.js ->
 *           API.reportConversation), que hoje batem em endpoints
 *           diferentes mas devem cair na mesma fila (comentário no
 *           próprio app.js confirma isso).
 *         anexo: { url, tipo } | null,                // evidência anexada no formulário de Denúncia
 *         respostas: [{ autor, mensagem, criado_em }]
 *       }
 *
 *   GET   /admin/ocorrencias/:id                    -> mesmo item acima, completo
 *   PATCH /admin/ocorrencias/:id/status  body: { status, motivo? }
 *         status: 'aberta' | 'andamento' | 'resolvida' | 'fechada' | 'improcedente'
 *         motivo obrigatório em 'improcedente' (o denunciante pode ver esse texto).
 *   POST  /admin/ocorrencias/:id/resposta body: { mensagem }  -> { ok: true }
 *
 *   GET /admin/ocorrencias/resumo
 *     -> { denuncias_abertas, casos_resolvidos, tickets_suporte,
 *          total_pendentes, criticas_sem_resposta_24h }
 *     Mesmo espírito de obterEstatisticasPagamentosAdmin: os cards do topo
 *     olham a base inteira, não só a página/filtro atual da tabela.
 *
 * NÃO reinventamos rotas que já existem em outras telas do admin:
 *   - reincidência do denunciado  -> buscarUsuarioAdminPorId(id).estatisticas.denuncias_recebidas
 *     (usuarios/admin-api.js + detalhe.js já leem esse campo)
 *   - reativar conta suspensa     -> abrirModalStatus (admin-usuario-acoes.js), sem rota nova
 *   - investigar pagamento ligado a uma denúncia de golpe -> tela de Pagamentos
 *     já existente (obterTransacaoAdmin), só linkamos pra lá
 * ------------------------------------------------------------------
 */

async function listarOcorrenciasAdmin({ busca = '', tipo = 'todos', status = 'todos', prioridade = 'todos', denunciadoId = '', pagina = 1, porPagina = 10 } = {}) {
    const params = new URLSearchParams({ page: String(pagina), limit: String(porPagina) });
    if (busca) params.set('busca', busca);
    if (tipo !== 'todos') params.set('tipo', tipo);
    if (status !== 'todos') params.set('status', status);
    if (prioridade !== 'todos') params.set('prioridade', prioridade);
    if (denunciadoId) params.set('denunciado_id', String(denunciadoId));
    return apiRequest(`/admin/ocorrencias?${params}`, 'GET', null, 'Não foi possível carregar as ocorrências.');
}

async function obterOcorrenciaAdmin(id) {
    return apiRequest(`/admin/ocorrencias/${encodeURIComponent(id)}`, 'GET', null, 'Não foi possível carregar a ocorrência.');
}

async function obterResumoOcorrenciasAdmin() {
    return apiRequest('/admin/ocorrencias/resumo', 'GET', null, 'Não foi possível carregar o resumo de ocorrências.');
}

// motivo obrigatório apenas para 'improcedente' (mesma regra de
// alterarStatusUsuarioAdmin ao suspender: o back guarda e o usuário vê).
async function alterarStatusOcorrenciaAdmin(id, status, motivo = '') {
    const corpo = { status };
    if (status === 'improcedente') corpo.motivo = String(motivo || '').trim();
    return apiRequest(`/admin/ocorrencias/${encodeURIComponent(id)}/status`, 'PATCH', corpo, 'Não foi possível atualizar o status.');
}

async function responderOcorrenciaAdmin(id, mensagem) {
    return apiRequest(`/admin/ocorrencias/${encodeURIComponent(id)}/resposta`, 'POST', { mensagem }, 'Não foi possível enviar a resposta.');
}

// ---------- normalização ----------
function origemOcorrenciaAdmin(r) {
    if (r.aluguel_id) return { tipo: 'aluguel', id: String(r.aluguel_id) };
    if (r.produto_id) return { tipo: 'anuncio', id: String(r.produto_id) };
    if (r.avaliacao_id) return { tipo: 'avaliacao', id: String(r.avaliacao_id) };
    if (r.conversa_id) return { tipo: 'conversa', id: String(r.conversa_id) };
    return null;
}

function normalizarOcorrenciaAdmin(r) {
    return {
        id: String(r.id),
        tipo: r.tipo,
        denuncianteId: r.denunciante?.id ? String(r.denunciante.id) : null,
        denuncianteNome: r.denunciante?.nome || 'Usuário',
        denunciadoId: r.denunciado?.id ? String(r.denunciado.id) : null,
        denunciadoNome: r.denunciado?.nome || null,
        motivo: r.motivo || '(sem assunto)',
        descricao: r.descricao || '',
        prioridade: r.prioridade || 'baixa',
        status: r.status || 'aberta',
        protocolo: r.protocolo || '',
        criadoEm: r.criado_em,
        origem: origemOcorrenciaAdmin(r),
        anexo: r.anexo || null,
        respostas: Array.isArray(r.respostas) ? r.respostas : []
    };
}