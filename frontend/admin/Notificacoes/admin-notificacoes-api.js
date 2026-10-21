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
 *   GET    /admin/comunicados/destinatarios/contagem?segmento=locatarios
 *            -> { quantidade }   (quantas contas o segmento alcança AGORA; o front mostra
 *               no formulário e na confirmação de "Enviar Agora")
 *   POST   /admin/comunicados/teste
 *            body: { titulo, mensagem }
 *            CONFIRMADO pelo back: cria uma notificação PRIVADA na caixa de entrada do admin
 *            logado (GET /admin/notificacoes), com tipo "comunicado_teste", categoria "sistema",
 *            prioridade "normal", lida false e referencia null. Entra em nao_lidas /
 *            recebidas_hoje / por_categoria.sistema do /admin/notificacoes/resumo, mas NÃO cria
 *            item no histórico desta Central, não entra nas estatísticas e não envia e-mail,
 *            Socket.IO nem notificação a outros usuários. Não exige conta de usuário vinculada
 *            (o 409 antigo deixou de existir). Obs.: /admin/notificacoes/* é a caixa de entrada
 *            do admin; esta Central de envio usa /admin/comunicados/*.
 *   GET    /admin/comunicados?page=1&limit=10
 *            -> { dados: [notificação...], total }        (mais recentes primeiro)
 *   GET    /admin/comunicados/estatisticas
 *            -> { enviadas, agendadas, total_usuarios }
 *   POST   /admin/comunicados
 *            body: { titulo, mensagem, destinatarios, status, agendada_para, chave_idempotencia }
 *            chave_idempotencia (string): o front gera uma por tentativa e REUSA em retry.
 *              Se o back já processou essa chave com sucesso, devolve o MESMO resultado
 *              (200) em vez de criar/enviar de novo. Guardar a chave só quando a operação
 *              deu certo (erro de validação não consome a chave).
 *            status "enviada"  -> o back dispara agora e devolve a notificação com
 *                                 status "enviando" (ou "enviada", se for instantâneo)
 *            status "agendada" -> o back guarda e dispara em agendada_para (deve estar no futuro)
 *            status "rascunho" -> só guarda
 *   PUT    /admin/comunicados/:id
 *            mesmo body do POST; só aceita edição de rascunho e agendada
 *            (enviada -> 409). Editar uma agendada com status "rascunho" cancela o agendamento.
 *   DELETE /admin/comunicados/:id
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
// O back entrega o teste só para o admin logado: ele aparece na página "Notificações"
// do painel dele (tipo comunicado_teste, categoria sistema), não no histórico desta Central
// e não nas estatísticas. Atenção: a caixa de entrada respeita as preferências do admin
// (Configurações -> Notificações): com "somente urgentes" ligado ou a categoria Sistema
// desligada, um teste de prioridade normal não aparece na lista.
async function enviarTesteNotificacaoAdmin(dados) {
    const padrao = 'Não foi possível enviar o teste.';
    try {
        return await apiRequest('/admin/comunicados/teste', 'POST', dados, padrao);
    } catch (erro) {
        throw traduzirErroTesteNotificacaoAdmin(erro, padrao);
    }
}

function traduzirErroTesteNotificacaoAdmin(erro, padrao) {
    const status = erro && erro.status;
    console.error('[notificações] falha no teste:', status, erro);
    if (status === 404) {
        return new Error('O servidor não tem a rota de envio de teste (404). Avise o time do back-end.');
    }
    if (status === 409) {
        // Não deve mais ocorrer (o teste não depende de conta de usuário); mantém a mensagem do back por segurança.
        return new Error(erro.message || 'Não foi possível entregar o teste na sua caixa de notificações.');
    }
    if (status === 401 || status === 403) {
        return new Error('Sua sessão não tem permissão para enviar o teste. Entre de novo como administrador.');
    }
    if (status >= 500) {
        return new Error(`O servidor falhou ao enviar o teste (${status}). Tente de novo em instantes.`);
    }
    return erro instanceof Error ? erro : new Error(padrao);
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