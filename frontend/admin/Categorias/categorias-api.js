/**
 * categorias-api.js
 * ------------------------------------------------------------------
 * Chamadas do admin para as rotas de categorias.
 * Usa o mesmo `apiRequest` (Login/api.js) das outras telas do admin.
 *
 * ROTAS (contrato confirmado pelo back):
 *   GET    /admin/categorias                  lista TODAS, já com `total_itens`
 *   POST   /admin/categorias                  cria   { nome, icone, cor }
 *   PATCH  /admin/categorias/:id               edita  { nome, icone, cor }
 *   DELETE /admin/categorias/:id               exclui; 409 `categoria_com_itens` se houver
 *                                               QUALQUER objeto vinculado (inclusive arquivado)
 *   POST   /admin/categorias/:id/mover-itens   { destino_id } -> { movidos: <qtd> }
 *                                               move também arquivados/ocultos (transação Serializable)
 *
 * FORMATO de cada categoria: { id, nome, slug, icone, cor, total_itens }
 *   total_itens conta TODOS os objetos da categoria: ativos, arquivados, ocultos pela
 *   administração, pausados, em locação e com solicitação pendente.
 * Nome duplicado => 409 (código/mensagem contendo "duplicad"/"existe"/"nome").
 *
 * IMPORTANTE — slug estável: ao RENOMEAR uma categoria (PATCH), o back não
 * pode gerar um slug novo a partir do nome novo. Objetos já cadastrados
 * guardam o slug da categoria; se ele mudar, esses objetos somem do filtro
 * do Início e a tela de Editar Objeto mostra a categoria em branco pra eles.
 * ------------------------------------------------------------------
 */

async function listarCategoriasAdmin() {
    const resposta = await apiRequest('/admin/categorias', 'GET', null, 'Não foi possível carregar as categorias.');
    // Aceita array puro ou embrulhado ({ data | dados | items })
    return Array.isArray(resposta) ? resposta : (resposta?.data || resposta?.dados || resposta?.items || []);
}

function traduzirErroCategoriaAdmin(erro) {
    if (erro.status === 404) {
        return new Error('Esta categoria não existe mais. Atualize a página e tente de novo.');
    }
    if (erro.status === 409) {
        const texto = `${erro.codigo || ''} ${erro.message || ''}`;
        // Código definitivo do back para exclusão com objetos vinculados.
        if (/categoria_com_itens/i.test(texto)) {
            return new Error('Esta categoria ainda tem itens vinculados (inclusive arquivados ou ocultos). Mova os itens para outra categoria antes de excluir.');
        }
        if (/duplicad|existe|nome/i.test(texto)) {
            return new Error('Já existe uma categoria com esse nome.');
        }
    }
    return erro; // demais casos: mensagem original do back
}

async function criarCategoriaAdmin({ nome, icone, cor }) {
    try {
        return await apiRequest('/admin/categorias', 'POST', { nome, icone, cor }, 'Não foi possível criar a categoria.');
    } catch (erro) {
        throw traduzirErroCategoriaAdmin(erro);
    }
}

async function atualizarCategoriaAdmin(id, { nome, icone, cor }) {
    try {
        return await apiRequest(
            `/admin/categorias/${encodeURIComponent(id)}`,
            'PATCH',
            { nome, icone, cor },
            'Não foi possível salvar a categoria.'
        );
    } catch (erro) {
        throw traduzirErroCategoriaAdmin(erro);
    }
}

async function excluirCategoriaAdmin(id) {
    try {
        return await apiRequest(
            `/admin/categorias/${encodeURIComponent(id)}`,
            'DELETE',
            null,
            'Não foi possível excluir a categoria.'
        );
    } catch (erro) {
        throw traduzirErroCategoriaAdmin(erro);
    }
}

// Usada no modal de excluir quando a categoria ainda tem itens: move todos
// pra `destinoId` antes de excluir a categoria de origem (ver categorias-acoes.js).
async function moverItensCategoriaAdmin(origemId, destinoId) {
    try {
        return await apiRequest(
            `/admin/categorias/${encodeURIComponent(origemId)}/mover-itens`,
            'POST',
            { destino_id: destinoId },
            'Não foi possível mover os itens para a outra categoria.'
        );
    } catch (erro) {
        throw traduzirErroCategoriaAdmin(erro);
    }
}