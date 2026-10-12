/**
 * verificacoes-api.js
 * ------------------------------------------------------------------
 * Chamadas do admin para a análise de verificação de conta.
 * Usa apiRequest/API_URL de /assets/usuario/Login/api.js (carregar antes).
 *
 * Rotas (contrato proposto para o back — ver CONTRATO-BACK.md):
 *   GET   /admin/verificacoes?status=&busca=&page=&limit=
 *   GET   /admin/verificacoes/:id
 *   PATCH /admin/verificacoes/:id            { aprovar: true } | { aprovar: false, motivo }
 *   PATCH /admin/verificacoes/:id            { revogar: true, motivo }   (só em verificação aprovada)
 *   GET   /admin/verificacoes/:id/arquivos/:tipo   (frente | verso | selfie) -> imagem
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
    const pedir = bearer => fetch(url, {
        credentials: 'same-origin',
        headers: bearer ? { Authorization: `Bearer ${bearer}` } : {}
    });

    let resposta = await pedir(token);
    if (resposta.status === 401 && token) resposta = await pedir(null);
    if (!resposta.ok) throw new Error('Não foi possível carregar a imagem.');

    return URL.createObjectURL(await resposta.blob());
}