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

// Cada item de `data` precisa vir com usuario: { id, nome, email } — o
// front usa id pra linkar pro perfil em Usuários e email pra diferenciar
// usuários com o mesmo nome (tela financeira, então isso importa).
async function listarTransacoesAdmin({ busca = '', status = 'todos', pagina = 1, porPagina = 10 } = {}) {
    const params = new URLSearchParams({ page: String(pagina), limit: String(porPagina) });
    if (busca) params.set('busca', busca);
    if (status !== 'todos') params.set('status', status);
    return apiRequest(`/admin/pagamentos?${params}`, 'GET', null, 'Não foi possível carregar as transações.');
}

// Contrato esperado do detalhe (além dos campos já resumidos na listagem):
//   usuario: { id, nome, email }
//   cartao: { bandeira, final } — só quando metodo === "cartao"; mesmo
//     resumo seguro (sem número completo) que pagamento.js já expõe pro
//     usuário, não é dado novo sendo exposto pro admin.
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