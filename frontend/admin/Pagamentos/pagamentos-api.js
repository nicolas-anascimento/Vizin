/**
 * pagamentos-api.js
 * ------------------------------------------------------------------
 * Chamadas do admin pra gerenciamento de pagamentos/transações da
 * plataforma.
 *
 * Métodos de pagamento confirmados no projeto: PIX e cartão (via Mercado
 * Pago — ver Login/pagamento.js do usuário). "Boleto" NÃO existe.
 *
 * O backend devolve somente o método canônico (`pix` ou `cartao`) e
 * agrega receita por `pago_em`, sem expor dados do cartão ou do gateway.
 * ------------------------------------------------------------------
 */

async function listarTransacoesAdmin({ busca = '', status = 'todos', pagina = 1, porPagina = 10 } = {}) {
    const params = new URLSearchParams({ page: String(pagina), limit: String(porPagina) });
    if (busca) params.set('busca', busca);
    if (status !== 'todos') params.set('status', status);
    return apiRequest(`/admin/pagamentos?${params}`, 'GET', null, 'Não foi possível carregar as transações.');
}

async function obterTransacaoAdmin(id) {
    return apiRequest(`/admin/pagamentos/${encodeURIComponent(id)}`, 'GET', null, 'Não foi possível carregar os detalhes da transação.');
}

// Contrato do agregador:
// {
//   receita_total, receita_variacao_percentual,
//   pagamentos_pendentes, transacoes_falhadas,
//   receita_mensal: [{ mes: "2026-01", valor }, ...]  (últimos 6 meses),
//   metodos: [{ metodo: "pix"|"cartao", total }, ...]
// }
async function obterEstatisticasPagamentosAdmin() {
    return apiRequest('/admin/pagamentos/estatisticas', 'GET', null, 'Não foi possível carregar as estatísticas de pagamentos.');
}
