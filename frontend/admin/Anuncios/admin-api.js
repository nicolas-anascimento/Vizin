/**
 * admin-api.js
 * ------------------------------------------------------------------
 * Chamadas do admin pra rotas de moderação de anúncios.
 *
 * Ciclo de vida do anúncio (ver admin-anuncio-acoes.js): ATIVO, REMOVIDO
 * e ARQUIVADO. "Arquivado" não é escolhido manualmente pelo admin — é o
 * back quem decide: quando o admin tenta EXCLUIR um anúncio que já teve
 * alguma locação no histórico, o back recusa o hard-delete (409) e o
 * front oferece arquivar no lugar (ver confirmarModalExcluirAnuncio em
 * admin-anuncio-acoes.js). Isso evita apagar um objeto que ainda é
 * referenciado por locações passadas/avaliações do inquilino.
 * "Alterar status -> Removido" continua pedindo motivo, porque o back
 * notifica o dono com essa mensagem (ver notificacoes-shared.js, tipo
 * "anuncio_removido_admin"). Arquivamento não notifica o dono (não é
 * uma penalidade, é só organização do catálogo).
 *
 * TODO: confirmar com o back-end:
 *   - o nome/valor exato do parâmetro de filtro de status na listagem
 *     (assumido aqui como "status=ativo|removido|arquivado");
 *   - o nome do parâmetro de busca por texto (assumido "busca");
 *   - o nome/formato exato do campo de status devolvido por
 *     GET /admin/objetos e esperado pelo PATCH (assumido "status", com
 *     os mesmos 3 valores acima — isso substitui o boolean "disponivel"
 *     que a rota usava antes de existir esse enum);
 *   - se os códigos de erro 409 continuam sendo os mesmos usados do lado
 *     do usuário em objetos-shared.js ("objeto_em_locacao" /
 *     "objeto_com_solicitacao_pendente") pras rotas de admin também;
 *   - o código exato do novo 409 de "tem histórico de locação, não pode
 *     excluir" (assumido aqui como "objeto_com_historico_locacao" — é o
 *     que dispara a oferta de arquivar em vez de excluir).
 * ------------------------------------------------------------------
 */

async function listarAnunciosAdmin({ busca = '', status = 'todos', pagina = 1, porPagina = 25 } = {}) {
    const params = new URLSearchParams({ page: String(pagina), limit: String(porPagina) });
    if (busca) params.set('busca', busca);
    if (status !== 'todos') params.set('status', status); // 'ativo' | 'removido' | 'arquivado'
    return apiRequest(`/admin/objetos?${params}`, 'GET', null, 'Não foi possível carregar objetos.');
}

// Erros de bloqueio (409), no mesmo espírito do traduzirErroDeBloqueio de
// objetos-shared.js do lado do usuário: o anúncio não pode ser removido
// enquanto está em locação ativa ou tem solicitação pendente. Também
// trata 404 (outro admin já alterou/excluiu esse mesmo anúncio antes) e
// o caso de "já teve locação no histórico" — nesse último, o erro sai
// marcado com `sugerirArquivar: true` pra quem chamou decidir o que
// fazer com essa sugestão (ver confirmarModalExcluirAnuncio).
function traduzirErroAnuncioAdmin(erro) {
    if (erro.status === 404) {
        return new Error('Este anúncio não existe mais ou foi alterado por outro administrador. Atualize a lista e tente de novo.');
    }
    if (erro.status === 409) {
        const codigo = String(erro.codigo || erro.message || '');
        if (/historico/i.test(codigo)) {
            const erroTraduzido = new Error('Este anúncio já teve locações no histórico e não pode ser excluído permanentemente. Você pode arquivá-lo em vez disso.');
            erroTraduzido.sugerirArquivar = true;
            return erroTraduzido;
        }
        if (/locacao/i.test(codigo)) {
            return new Error('Este anúncio está em locação ativa no momento e não pode ser removido.');
        }
        if (/pendente/i.test(codigo)) {
            return new Error('Este anúncio tem uma solicitação pendente e não pode ser removido agora.');
        }
    }
    return erro;
}

async function alterarStatusAnuncioAdmin(id, status, motivo = '') {
    try {
        return await apiRequest(
            `/admin/objetos/${encodeURIComponent(id)}`,
            'PATCH',
            { status, ...(motivo ? { motivo } : {}) },
            'Não foi possível moderar o objeto.'
        );
    } catch (erro) {
        throw traduzirErroAnuncioAdmin(erro);
    }
}

async function excluirAnuncioAdmin(id, motivo) {
    try {
        return await apiRequest(
            `/admin/objetos/${encodeURIComponent(id)}`,
            'DELETE',
            { motivo },
            'Não foi possível excluir o objeto.'
        );
    } catch (erro) {
        throw traduzirErroAnuncioAdmin(erro);
    }
}