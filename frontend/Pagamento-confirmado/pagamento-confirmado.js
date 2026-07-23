// ================= PROTEGER PÁGINA =================
if (!localStorage.getItem("token")) {
    window.location.href = "../Login/index.html";
}
 
// ================= LER DADOS DA URL =================
const params = new URLSearchParams(window.location.search);
const pedidoId = params.get("pedidoId");
 
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
 
/* ============================================================
   PONTO DE INTEGRAÇÃO COM O BACK-END
   GET /api/pedidos/:id
   Resposta esperada:
   {
     id, total, retirada, devolucao,
     objeto: { id, titulo }
   }
   ============================================================ */
async function carregarPedido() {
    if (!pedidoId) {
        console.error("pedidoId não informado na URL");
        return;
    }
 
    try {
        const response = await fetch(`/api/pedidos/${pedidoId}`, {
            headers: {
                "Authorization": `Bearer ${localStorage.getItem("token")}`
            }
        });
 
        if (!response.ok) throw new Error("Pedido não encontrado");
 
        const pedido = await response.json();
        const dias = calcularDias(pedido.retirada, pedido.devolucao);
 
        document.getElementById("confirmado-objeto-nome").textContent = pedido.objeto.titulo;
        document.getElementById("confirmado-retirada").textContent = formatarData(pedido.retirada);
        document.getElementById("confirmado-devolucao").textContent = formatarData(pedido.devolucao);
        document.getElementById("confirmado-periodo").textContent = `${dias} dia${dias > 1 ? "s" : ""}`;
        document.getElementById("confirmado-total").textContent = `R$ ${pedido.total}`;
 
        // ================= REDIRECIONAMENTO AUTOMÁTICO PARA A RETIRADA =================
        setTimeout(() => {
            const query = new URLSearchParams({
                produtoId: pedido.objeto.id,
                retirada: pedido.retirada,
                devolucao: pedido.devolucao
            });
            window.location.href = `../Retirada-objeto/index.html?${query.toString()}`;
        }, 3000);
 
    } catch (err) {
        console.error(err);
        alert("Não foi possível carregar a confirmação do pedido.");
    }
}
 
carregarPedido();
 
