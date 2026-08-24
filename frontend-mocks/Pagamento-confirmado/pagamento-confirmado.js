// ================= PROTEGER PÁGINA =================
if (!localStorage.getItem("token")) {
    window.location.href = "../Login/index.html";
}
 
// ================= LER DADOS DA URL =================
const params = new URLSearchParams(window.location.search);
const produtoId = params.get("produtoId") || "1";
const dataRetirada = params.get("retirada");
const dataDevolucao = params.get("devolucao");
const total = params.get("total") || "0";
 
// ================= MOCK DO PRODUTO =================
// PONTO DE INTEGRAÇÃO COM O BACK-END:
// Idealmente essa página recebe um id de pedido/pagamento (ex: ?pedidoId=123)
// e busca os dados confirmados via GET /api/pedidos/:id, em vez de confiar
// apenas nos parâmetros da URL.
const produto = {
    titulo: "Furadeira Profissional Bosch"
};
 
function formatarData(dataStr) {
    if (!dataStr) return "-";
    const [ano, mes, dia] = dataStr.split("-");
    return `${dia}/${mes}/${ano}`;
}
 
function calcularDias(retirada, devolucao) {
    if (!retirada || !devolucao) return 1;
    const diffMs = new Date(devolucao) - new Date(retirada);
    const dias = Math.round(diffMs / (1000 * 60 * 60 * 24));
    return dias > 0 ? dias : 1;
}
 
const dias = calcularDias(dataRetirada, dataDevolucao);
 
document.getElementById("confirmado-objeto-nome").textContent = produto.titulo;
document.getElementById("confirmado-retirada").textContent = formatarData(dataRetirada);
document.getElementById("confirmado-devolucao").textContent = formatarData(dataDevolucao);
document.getElementById("confirmado-periodo").textContent = `${dias} dia${dias > 1 ? "s" : ""}`;
document.getElementById("confirmado-total").textContent = `R$ ${total}`;
 
// ================= REDIRECIONAMENTO AUTOMÁTICO PARA A RETIRADA =================
setTimeout(() => {
    const query = new URLSearchParams({ produtoId, retirada: dataRetirada || "", devolucao: dataDevolucao || "" });
    window.location.href = `../Retirada-objeto/index.html?${query.toString()}`;
}, 3000);
 