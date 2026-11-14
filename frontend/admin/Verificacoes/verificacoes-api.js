/**
 * verificacoes-api.js
 * ------------------------------------------------------------------
 * Chamadas do admin para a análise de verificação de conta.
 * Usa apiRequest/API_URL de /assets/usuario/Login/api.js (carregar antes).
 *
 * Rotas (contrato confirmado pelo back):
 *   GET   /admin/verificacoes?status=&busca=&page=&limit=
 *   GET   /admin/verificacoes/:id
 *   PATCH /admin/verificacoes/:id            { aprovar: true } | { aprovar: false, motivo }
 *   PATCH /admin/verificacoes/:id            { revogar: true, motivo }   (só em verificação aprovada)
 *   GET   /admin/verificacoes/:id/arquivos/:tipo   (frente | verso | selfie) -> imagem
 *         200 bytes reais (Cache-Control: private, no-store) | 401 | 403 | 404 (inclui
 *         passaporte sem verso) | 422 (tipo inválido). Cookie e Bearer funcionam.
 *   A rota legada /documentos/:tipo foi preservada pelo back, mas não é usada aqui.
 * ------------------------------------------------------------------
 */
async function listarVerificacoesAdmin({ busca = '', status = 'pendente', pagina = 1, porPagina = 25 } = {}) {
    const params = new URLSearchParams({ page: String(pagina), limit: String(porPagina) });
    if (busca) params.set('busca', busca);
    if (status !== 'todos') params.set('status', status);
    return apiRequest(`/admin/verificacoes?${params}`, 'GET', null, 'Não foi possível carregar as verificações.');
}

async function buscarVerificacaoAdminPorId(id) {
    return apiRequest(`/admin/verificacoes/${encodeURIComponent(id)}`, 'GET', null, 'Não foi possível carregar a verificação.');
}

// motivo: obrigatório ao reprovar; o back grava e manda na notificação
// "verificacao_reprovada" (e a tela do usuário mostra esse texto).
async function decidirVerificacaoAdmin(id, aprovar, motivo = '') {
    const corpo = { aprovar: !!aprovar };
    if (!aprovar) corpo.motivo = String(motivo || '').trim();
    return apiRequest(`/admin/verificacoes/${encodeURIComponent(id)}`, 'PATCH', corpo, 'Não foi possível registrar a decisão.');
}

// Tira o selo de uma conta já verificada (ex.: fraude descoberta depois).
// O back volta a conta para não verificada, grava o motivo e manda a
// notificação "verificacao_revogada".
async function revogarVerificacaoAdmin(id, motivo) {
    return apiRequest(`/admin/verificacoes/${encodeURIComponent(id)}`, 'PATCH',
        { revogar: true, motivo: String(motivo || '').trim() }, 'Não foi possível revogar a verificação.');
}

// As imagens são documentos de identidade: a rota exige sessão de admin.
// apiRequest só lida com JSON, então aqui buscamos como Blob (mesma
// estratégia de auth do api.js: cookie + Bearer legado) e devolvemos uma
// object URL pra usar em <img>. Quem chama deve dar URL.revokeObjectURL.
async function baixarArquivoVerificacaoAdmin(id, tipo) {
    const url = `${API_URL}/admin/verificacoes/${encodeURIComponent(id)}/arquivos/${encodeURIComponent(tipo)}`;
    const token = localStorage.getItem('token');
    // 'include' (e não 'same-origin'): se a API estiver em outro domínio/porta
    // que a página, 'same-origin' não envia o cookie de sessão e dá 401.
    const pedir = bearer => fetch(url, {
        credentials: 'include',
        headers: bearer ? { Authorization: `Bearer ${bearer}` } : {}
    });

    let resposta;
    try {
        resposta = await pedir(token);
        if (resposta.status === 401 && token) resposta = await pedir(null);
    } catch (err) {
        console.error('[verificação] falha de rede/CORS ao buscar', url, err);
        throw new Error('Não foi possível carregar a imagem (falha de rede ou CORS).');
    }

    if (!resposta.ok) {
        console.error('[verificação] imagem recusada:', resposta.status, url);
        const motivo = {
            401: 'sessão não reconhecida',
            403: 'sem permissão',
            404: 'arquivo não encontrado no servidor',
            422: 'tipo de arquivo inválido'
        }[resposta.status] || 'erro no servidor';
        throw new Error(`Não foi possível carregar a imagem (${resposta.status} — ${motivo}).`);
    }

    const blob = await resposta.blob();
    if (!blob.type.startsWith('image/')) {
        console.error('[verificação] resposta não é imagem:', blob.type, url);
        throw new Error(`O servidor devolveu "${blob.type || 'tipo desconhecido'}" em vez de imagem.`);
    }
    return URL.createObjectURL(blob);
}