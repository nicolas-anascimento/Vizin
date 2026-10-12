/**
 * categorias-api.js
 * ------------------------------------------------------------------
 * Chamadas do admin para as rotas de categorias.
 * Usa o mesmo `apiRequest` (Login/api.js) das outras telas do admin.
 *
 * ROTAS ASSUMIDAS — confirmar com o back (é o único lugar a mudar):
 *   GET    /admin/categorias                  lista TODAS, já com a contagem de itens
 *   POST   /admin/categorias                  cria   { nome, icone, cor }
 *   PATCH  /admin/categorias/:id               edita  { nome, icone, cor }
 *   DELETE /admin/categorias/:id               exclui (409 se ainda houver itens)
 *   POST   /admin/categorias/:id/mover-itens   move todos os itens de :id pra outra
 *                                               categoria — { destino_id } — usada só no
 *                                               fluxo de excluir categoria com itens
 *                                               (ver categorias-acoes.js). Resposta
 *                                               esperada: { movidos: <quantidade> }.
 *
 * FORMATO ESPERADO de cada categoria na listagem:
 *   { id, nome, icone, cor, total_itens }
 *   - icone: classe do Bootstrap Icons (ex.: "bi-wrench")
 *   - cor:   hex de 6 dígitos (ex.: "#6D49F2")
 *   - total_itens: nº de objetos (não arquivados) da categoria — CONFIRMAR
 *     com o back se isto inclui itens ARQUIVADOS. Se não incluir, um objeto
 *     arquivado pode ficar com uma categoria "fantasma" depois de excluída
 *     (o botão de excluir aqui só olha para total_itens = 0).
 * O back precisa persistir `icone` e `cor` (2 colunas novas na tabela
 * de categorias). Nome duplicado => 409 com codigo contendo "duplicad"/"existe".
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
        const codigo = String(erro.codigo || erro.message || '');
        if (/duplicad|existe|nome/i.test(codigo)) {
            return new Error('Já existe uma categoria com esse nome.');
        }
        return new Error('Esta categoria ainda tem itens cadastrados e não pode ser excluída.');
    }
    return erro;
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