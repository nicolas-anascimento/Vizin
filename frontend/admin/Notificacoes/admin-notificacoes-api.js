/**
 * admin-notificacoes-api.js
 * ------------------------------------------------------------------
 * Chamadas da Central de Notificações do admin. Usa o mesmo apiRequest
 * de Login/api.js que o admin-api.js já usa.
 *
 * CONTRATO PARA O BACK-END
 *
 * Objeto "notificação do admin" (o que o GET devolve e o que o POST/PUT recebem):
 *   {
 *     id:               string (UUID),
 *     titulo:           string (até 100 caracteres),
 *     mensagem:         string (até 500 caracteres; pode ser vazia só em rascunho),
 *     destinatarios:    "todos" | "ativos" | "proprietarios" | "locatarios" | "novos",
 *     status:           "rascunho" | "agendada" | "enviando" | "enviada" | "falhou",
 *     agendada_para:    ISO 8601 (UTC) | null   — obrigatório quando status = "agendada",
 *     enviada_em:       ISO 8601 | null,
 *     criado_em:        ISO 8601,
 *     atualizado_em:    ISO 8601 | null,
 *     // opcionais (o front mostra se vierem):
 *     total_destinatarios: number | null,       — quantos usuários receberam/receberão
 *     erro_envio:          string | null,       — motivo legível quando status = "falhou"
 *     criado_por:          { id, nome } | null  — admin que criou (auditoria)
 *   }
 *
 * Estados: rascunho -> (agendada ->) enviando -> enviada, ou enviando -> falhou.
 * "enviando" existe porque um envio em massa não termina na hora: o POST responde
 * já com status "enviando" e o back conclui em segundo plano. O front recarrega
 * o histórico sozinho a cada 5 s enquanto houver algum "enviando".
 * Editáveis/excluíveis: rascunho, agendada e falhou (PUT com status "enviada"
 * num "falhou" tenta o envio de novo). enviando e enviada -> 409.
 *
 * Segmentos de "destinatarios" (quem o back deve alcançar):
 *   todos          -> todas as contas
 *   ativos         -> contas com ativo = true
 *   proprietarios  -> contas ativas com pelo menos 1 anúncio (não arquivado)
 *   locatarios     -> contas ativas com pelo menos 1 solicitação como locatário
 *   novos          -> contas ativas criadas nos últimos 30 dias
 * (as três últimas são filtros sobre contas ativas; uma pessoa pode cair em
 *  mais de um segmento, e o segmento é resolvido no momento do ENVIO, não no
 *  do agendamento)
 *
 * Rotas:
 *   GET    /admin/notificacoes/destinatarios/contagem?segmento=locatarios
 *            -> { quantidade }   (quantas contas o segmento alcança AGORA; o front mostra
 *               no formulário e na confirmação de "Enviar Agora")
 *   POST   /admin/notificacoes/teste
 *            body: { titulo, mensagem }
 *            entrega uma notificação "comunicado_admin" SÓ para a conta de usuário do admin
 *            logado, para ele ver como fica no sino. Não cria item no histórico nem entra
 *            nas estatísticas. Sem conta de usuário vinculada -> 409 com mensagem legível.
 *   GET    /admin/notificacoes?page=1&limit=10
 *            -> { dados: [notificação...], total }        (mais recentes primeiro)
 *   GET    /admin/notificacoes/estatisticas
 *            -> { enviadas, agendadas, total_usuarios }
 *   POST   /admin/notificacoes
 *            body: { titulo, mensagem, destinatarios, status, agendada_para, chave_idempotencia }
 *            chave_idempotencia (string): o front gera uma por tentativa e REUSA em retry.
 *              Se o back já processou essa chave com sucesso, devolve o MESMO resultado
 *              (200) em vez de criar/enviar de novo. Guardar a chave só quando a operação
 *              deu certo (erro de validação não consome a chave).
 *            status "enviada"  -> o back dispara agora e devolve a notificação com
 *                                 status "enviando" (ou "enviada", se for instantâneo)
 *            status "agendada" -> o back guarda e dispara em agendada_para (deve estar no futuro)
 *            status "rascunho" -> só guarda
 *   PUT    /admin/notificacoes/:id
 *            mesmo body do POST; só aceita edição de rascunho e agendada
 *            (enviada -> 409). Editar uma agendada com status "rascunho" cancela o agendamento.
 *   DELETE /admin/notificacoes/:id
 *            só rascunho e agendada (enviada -> 409). Excluir agendada cancela o envio.
 *
 * Cada usuário destinatário recebe uma notificação no sino (tipo sugerido:
 * "comunicado_admin") com titulo/mensagem do admin.
 * ------------------------------------------------------------------
 */

async function listarNotificacoesAdmin({ pagina = 1, porPagina = 10 } = {}) {
    const params = new URLSearchParams({ page: String(pagina), limit: String(porPagina) });
    return apiRequest(`/admin/comunicados?${params}`, 'GET', null, 'Não foi possível carregar o histórico de notificações.');
}

async function estatisticasNotificacoesAdmin() {
    return apiRequest('/admin/comunicados/estatisticas', 'GET', null, 'Não foi possível carregar as estatísticas.');
}

// dados = { titulo, mensagem, destinatarios, status, agendada_para }
async function contarDestinatariosNotificacaoAdmin(segmento) {
    const params = new URLSearchParams({ segmento: String(segmento) });
    return apiRequest(`/admin/comunicados/destinatarios/contagem?${params}`, 'GET', null, 'Não foi possível calcular o alcance.');
}

// dados = { titulo, mensagem }
async function enviarTesteNotificacaoAdmin(dados) {
    return apiRequest('/admin/comunicados/teste', 'POST', dados, 'Não foi possível enviar o teste.');
}

// dados = { titulo, mensagem, destinatarios, status, agendada_para, chave_idempotencia }
async function criarNotificacaoAdmin(dados) {
    return apiRequest('/admin/comunicados', 'POST', dados, 'Não foi possível salvar a notificação.');
}

async function atualizarNotificacaoAdmin(id, dados) {
    return apiRequest(`/admin/comunicados/${encodeURIComponent(id)}`, 'PUT', dados, 'Não foi possível atualizar a notificação.');
}

async function excluirNotificacaoAdmin(id) {
    return apiRequest(`/admin/comunicados/${encodeURIComponent(id)}`, 'DELETE', null, 'Não foi possível excluir a notificação.');
}
