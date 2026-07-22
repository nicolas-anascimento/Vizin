// ================= PROTEGER PÁGINA =================
if (!localStorage.getItem("token")) {
    window.location.href = "../login/index.html";
}
 
// ================= LER DADOS DA URL =================
const params = new URLSearchParams(window.location.search);
const produtoId = params.get("produtoId") || "1";
const dataRetirada = params.get("retirada");
const dataDevolucao = params.get("devolucao");
 
document.getElementById("link-voltar").addEventListener("click", (e) => {
    e.preventDefault();
    window.location.href = `produto.html?id=${produtoId}`;
});
 
// ================= CARREGAR PRODUTO E MONTAR RESUMO =================
let produto = null;
let dias = 1;
let total = 0;
 
function formatarData(dataStr) {
    if (!dataStr) return "-";
    const [ano, mes, dia] = dataStr.split("-");
    return `${dia}/${mes}/${ano}`;
}
 
function calcularDias(retirada, devolucao) {
    if (!retirada || !devolucao) return 1;
    const diffMs = new Date(devolucao) - new Date(retirada);
    const diasCalc = Math.round(diffMs / (1000 * 60 * 60 * 24));
    return diasCalc > 0 ? diasCalc : 1;
}
 
function preencherResumo() {
    document.getElementById("resumo-imagem").src = produto.imagem;
    document.getElementById("resumo-produto-nome").textContent = produto.titulo;
    document.getElementById("resumo-produto-categoria").textContent = produto.categoria;
    document.getElementById("resumo-periodo").textContent = `${dias} dia${dias > 1 ? "s" : ""}`;
    document.getElementById("resumo-retirada").textContent = formatarData(dataRetirada);
    document.getElementById("resumo-devolucao").textContent = formatarData(dataDevolucao);
    document.getElementById("resumo-preco-dia").textContent = `R$ ${produto.preco_dia}`;
    document.getElementById("resumo-subtotal").textContent = `R$ ${total}`;
    document.getElementById("resumo-total").textContent = `R$ ${total}`;
    document.getElementById("pix-valor").textContent = `R$ ${total}`;
    document.getElementById("btn-pagar-cartao").textContent = `Pagar R$ ${total}`;
}
 
/* ============================================================
   PONTO DE INTEGRAÇÃO COM O BACK-END
   1) GET /api/objetos/:id — mesmo endpoint da página de produto.
   2) POST /api/pagamentos/pix/gerar
      body: { objeto_id, retirada, devolucao }
      Resposta esperada: { codigo_copia_cola, valor, qrcode_url }
      (o back-end é quem deve calcular o valor final e gerar a
      cobrança junto ao provedor de PIX)
   ============================================================ */
async function carregarResumo() {
    try {
        const response = await fetch(`/api/objetos/${produtoId}`, {
            headers: {
                "Authorization": `Bearer ${localStorage.getItem("token")}`
            }
        });
 
        if (!response.ok) throw new Error("Objeto não encontrado");
 
        produto = await response.json();
        dias = calcularDias(dataRetirada, dataDevolucao);
        total = dias * produto.preco_dia; // taxa de serviço = R$0 por enquanto
 
        preencherResumo();
        await carregarCobrancaPix();
 
    } catch (err) {
        console.error(err);
        alert("Não foi possível carregar os dados do pagamento.");
    }
}
 
async function carregarCobrancaPix() {
    try {
        const response = await fetch("/api/pagamentos/pix/gerar", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${localStorage.getItem("token")}`
            },
            body: JSON.stringify({
                objeto_id: produto.id,
                retirada: dataRetirada,
                devolucao: dataDevolucao
            })
        });
 
        if (!response.ok) throw new Error("Erro ao gerar cobrança PIX");
 
        const pix = await response.json();
        document.getElementById("pix-codigo").value = pix.codigo_copia_cola;
        // Se o back-end retornar uma URL de imagem do QR Code, defina aqui
        // o src do elemento <img> responsável por exibi-lo, por exemplo:
        // document.getElementById("pix-qrcode").src = pix.qrcode_url;
 
    } catch (err) {
        console.error(err);
    }
}
 
// ================= SELEÇÃO DO MÉTODO DE PAGAMENTO =================
const btnPix = document.getElementById("metodo-pix");
const btnCartao = document.getElementById("metodo-cartao");
const conteudoPix = document.getElementById("conteudo-pix");
const conteudoCartao = document.getElementById("conteudo-cartao");
const metodoVazio = document.getElementById("metodo-vazio");
 
function selecionarMetodo(metodo) {
    btnPix.classList.toggle("ativo", metodo === "pix");
    btnCartao.classList.toggle("ativo", metodo === "cartao");
    conteudoPix.style.display = metodo === "pix" ? "block" : "none";
    conteudoCartao.style.display = metodo === "cartao" ? "block" : "none";
    metodoVazio.style.display = "none";
}
 
btnPix.addEventListener("click", () => selecionarMetodo("pix"));
btnCartao.addEventListener("click", () => selecionarMetodo("cartao"));
 
// ================= COPIAR CÓDIGO PIX =================
document.getElementById("btn-copiar-pix").addEventListener("click", () => {
    const campo = document.getElementById("pix-codigo");
    navigator.clipboard.writeText(campo.value).then(() => {
        mostrarToast("Código PIX copiado");
    });
});
 
// ================= REDIRECIONAR PARA A CONFIRMAÇÃO =================
function irParaConfirmacao(pedidoId) {
    const query = new URLSearchParams({ pedidoId });
    window.location.href = `pagamento-confirmado.html?${query.toString()}`;
}
 
// ================= CONFIRMAR PAGAMENTO VIA PIX =================
/* ============================================================
   PONTO DE INTEGRAÇÃO COM O BACK-END
   POST /api/pagamentos/pix/confirmar
   body: { objeto_id, retirada, devolucao }
   Resposta esperada: { pedido_id }
   ============================================================ */
document.getElementById("btn-confirmar-pix").addEventListener("click", async (e) => {
    const btn = e.currentTarget;
    btn.disabled = true;
    btn.innerHTML = `<span class="spinner"></span> Confirmando...`;
 
    try {
        const response = await fetch("/api/pagamentos/pix/confirmar", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${localStorage.getItem("token")}`
            },
            body: JSON.stringify({
                objeto_id: produto.id,
                retirada: dataRetirada,
                devolucao: dataDevolucao
            })
        });
 
        if (!response.ok) throw new Error("Pagamento não confirmado");
 
        const { pedido_id } = await response.json();
        irParaConfirmacao(pedido_id);
 
    } catch (err) {
        console.error(err);
        alert("Não foi possível confirmar o pagamento PIX. Tente novamente.");
        btn.disabled = false;
        btn.textContent = "Já realizei o pagamento PIX";
    }
});
 
// ================= PAGAR COM CARTÃO =================
const formCartao = document.getElementById("form-cartao");
 
// Máscara simples pro número do cartão (grupos de 4)
document.getElementById("cartao-numero").addEventListener("input", (e) => {
    e.target.value = e.target.value
        .replace(/\D/g, "")
        .slice(0, 16)
        .replace(/(\d{4})(?=\d)/g, "$1 ");
});
 
document.getElementById("cartao-validade").addEventListener("input", (e) => {
    e.target.value = e.target.value
        .replace(/\D/g, "")
        .slice(0, 4)
        .replace(/(\d{2})(?=\d)/, "$1/");
});
 
document.getElementById("cartao-cvv").addEventListener("input", (e) => {
    e.target.value = e.target.value.replace(/\D/g, "").slice(0, 4);
});
 
/* ============================================================
   PONTO DE INTEGRAÇÃO COM O BACK-END — ATENÇÃO
   Nunca envie os dados do cartão (número, validade, CVV) em texto
   puro para o back-end próprio. O correto é usar a tokenização de
   um gateway de pagamento (Stripe, Pagar.me, etc.) aqui no próprio
   front-end e enviar somente o token gerado por ele.
 
   POST /api/pagamentos/cartao
   body: { objeto_id, retirada, devolucao, token_cartao }
   Resposta esperada: { pedido_id }
 
   O trecho abaixo é um esqueleto: substitua a geração do
   token_cartao pela chamada real ao SDK do gateway escolhido antes
   de habilitar este fluxo em produção.
   ============================================================ */
formCartao.addEventListener("submit", async (e) => {
    e.preventDefault();
 
    const numero = document.getElementById("cartao-numero").value.trim();
    const nome = document.getElementById("cartao-nome").value.trim();
    const validade = document.getElementById("cartao-validade").value.trim();
    const cvv = document.getElementById("cartao-cvv").value.trim();
 
    if (numero.replace(/\s/g, "").length < 16 || !nome || validade.length < 5 || cvv.length < 3) {
        alert("Verifique os dados do cartão.");
        return;
    }
 
    const btn = document.getElementById("btn-pagar-cartao");
    btn.disabled = true;
    btn.innerHTML = `<span class="spinner"></span> Processando...`;
 
    try {
        // TODO: gerar o token junto ao gateway de pagamento antes de enviar.
        const tokenCartao = null;
 
        if (!tokenCartao) {
            throw new Error("Tokenização do cartão ainda não configurada");
        }
 
        const response = await fetch("/api/pagamentos/cartao", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${localStorage.getItem("token")}`
            },
            body: JSON.stringify({
                objeto_id: produto.id,
                retirada: dataRetirada,
                devolucao: dataDevolucao,
                token_cartao: tokenCartao
            })
        });
 
        if (!response.ok) throw new Error("Pagamento recusado");
 
        const { pedido_id } = await response.json();
        irParaConfirmacao(pedido_id);
 
    } catch (err) {
        console.error(err);
        alert("Não foi possível processar o pagamento. Verifique os dados e tente novamente.");
        btn.disabled = false;
        btn.textContent = `Pagar R$ ${total}`;
    }
});
 
// ================= TOAST =================
function mostrarToast(mensagem, tipo = "sucesso") {
    let toast = document.getElementById("toast");
    if (!toast) {
        toast = document.createElement("div");
        toast.id = "toast";
        toast.className = "toast";
        document.body.appendChild(toast);
    }
    toast.innerText = mensagem;
    toast.className = `toast show ${tipo}`;
    setTimeout(() => toast.classList.remove("show"), 2500);
}
 
carregarResumo();
 