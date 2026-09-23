/**
 * pagamentos-api.js
 * ------------------------------------------------------------------
 * Chamadas do admin pra gerenciamento de pagamentos/transações da
 * plataforma.
 *
 * Métodos de pagamento confirmados no projeto: PIX e cartão (via Mercado
 * Pago — ver Login/pagamento.js do usuário). "Boleto" NÃO existe.
 *
 * TODO: confirmar com o back-end:
 *   - nome exato das rotas (todas assumidas abaixo, seguindo o mesmo
 *     padrão de /admin/objetos já usado em Anúncios);
 *   - enum de status da transação — assumido "pago" | "pendente" |
 *     "falhou" | "estornado" (os dois primeiros batem com o que
 *     solicitacoes-shared.js do usuário já usa: `pagamentos[].status`);
 *   - como "cartão" se divide em crédito/débito por transação — o cartão
 *     salvo pelo usuário (pagamento.js) só guarda bandeira + últimos 4
 *     dígitos, sem indicar crédito ou débito. Assumido aqui que esse dado
 *     vem pronto no campo `metodo` de cada transação (ex: "cartao_credito"
 *     vs "cartao_debito"), escolhido pelo usuário no momento do checkout;
 *   - se o DTO da transação traz `tipo` ("aluguel" | "multa" — ver
 *     finalizar-pagamento.js e pagamento-multa.js do usuário, que chamam
 *     CheckoutVizin com tipos diferentes), usado no modal de detalhes;
 *   - o formato exato das estatísticas do dashboard (assumido abaixo em
 *     obterEstatisticasPagamentosAdmin) — ideal que já venham agregadas
 *     do back, porque calcular receita mensal/por método no front a
 *     partir da listagem completa não escala bem com muita transação.
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

// Formato assumido:
// {
//   receita_total, receita_variacao_percentual,
//   pagamentos_pendentes, transacoes_falhadas,
//   receita_mensal: [{ mes: "2026-01", valor }, ...]  (últimos 6 meses),
//   metodos: [{ metodo: "pix"|"cartao_credito"|"cartao_debito", total }, ...]
// }
async function obterEstatisticasPagamentosAdmin() {
    return apiRequest('/admin/pagamentos/estatisticas', 'GET', null, 'Não foi possível carregar as estatísticas de pagamentos.');
}
