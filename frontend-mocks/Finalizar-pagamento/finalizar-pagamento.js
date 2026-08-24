// ================= PROTEGER PÁGINA =================
if (!localStorage.getItem("token")) {
    window.location.href = "../Login/index.html";
}
 
// ================= LER DADOS DA URL =================
const params = new URLSearchParams(window.location.search);
const produtoId = params.get("produtoId") || "1";
const dataRetirada = params.get("retirada");
const dataDevolucao = params.get("devolucao");
 
document.getElementById("link-voltar").addEventListener("click", (e) => {
    e.preventDefault();
    window.location.href = `../Produto/index.html?id=${produtoId}`;
});
 
// ================= MOCK DO PRODUTO =================
// PONTO DE INTEGRAÇÃO COM O BACK-END:
// Buscar o objeto real via GET /api/objetos/:id (mesmo endpoint da página de produto).
const produto = {
    id: produtoId,
    titulo: "Furadeira Profissional Bosch",
    categoria: "Ferramentas",
    preco_dia: 35,
    imagem: "../img/sem-imagem.jpg"
};
 
// ================= CÁLCULO DO RESUMO =================
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
const subtotal = dias * produto.preco_dia;
const total = subtotal; // taxa de serviço = R$0 por enquanto
 
function preencherResumo() {
    document.getElementById("resumo-imagem").src = produto.imagem;
    document.getElementById("resumo-produto-nome").textContent = produto.titulo;
    document.getElementById("resumo-produto-categoria").textContent = produto.categoria;
    document.getElementById("resumo-periodo").textContent = `${dias} dia${dias > 1 ? "s" : ""}`;
    document.getElementById("resumo-retirada").textContent = formatarData(dataRetirada);
    document.getElementById("resumo-devolucao").textContent = formatarData(dataDevolucao);
    document.getElementById("resumo-preco-dia").textContent = `R$ ${produto.preco_dia}`;
    document.getElementById("resumo-subtotal").textContent = `R$ ${subtotal}`;
    document.getElementById("resumo-total").textContent = `R$ ${total}`;
    document.getElementById("pix-valor").textContent = `R$ ${total}`;
 
    // Código PIX fictício de exemplo — o back-end deve gerar o código real
    // (copia e cola) junto com o QR Code ao criar a cobrança.
    document.getElementById("pix-codigo").value =
        `vizin.app.pix.${"1234567890".repeat(4)}`.slice(0, 70);
}
 
preencherResumo();
 
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
function irParaConfirmacao() {
    const query = new URLSearchParams({
        produtoId: produto.id,
        retirada: dataRetirada || "",
        devolucao: dataDevolucao || "",
        total: total
    });
    window.location.href = `../Pagamento-confirmado/index.html?${query.toString()}`;
}
 
// ================= CONFIRMAR PAGAMENTO VIA PIX =================
document.getElementById("btn-confirmar-pix").addEventListener("click", async (e) => {
    const btn = e.currentTarget;
    btn.disabled = true;
    btn.innerHTML = `<span class="spinner"></span> Confirmando...`;
 
    try {
        // PONTO DE INTEGRAÇÃO COM O BACK-END:
        // const response = await fetch("/api/pagamentos/pix/confirmar", {
        //     method: "POST",
        //     headers: {
        //         "Content-Type": "application/json",
        //         "Authorization": `Bearer ${localStorage.getItem("token")}`
        //     },
        //     body: JSON.stringify({ objeto_id: produto.id, retirada: dataRetirada, devolucao: dataDevolucao })
        // });
        // if (!response.ok) throw new Error("Pagamento não confirmado");
 
        await new Promise(resolve => setTimeout(resolve, 1200)); // simula processamento
        irParaConfirmacao();
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
        // PONTO DE INTEGRAÇÃO COM O BACK-END:
        // ATENÇÃO: nunca envie os dados do cartão em texto puro para um back-end próprio.
        // O ideal é usar a tokenização de um gateway de pagamento (Stripe, Pagar.me, etc.)
        // no próprio front-end, e enviar apenas o token gerado, por exemplo:
        //
        // const response = await fetch("/api/pagamentos/cartao", {
        //     method: "POST",
        //     headers: {
        //         "Content-Type": "application/json",
        //         "Authorization": `Bearer ${localStorage.getItem("token")}`
        //     },
        //     body: JSON.stringify({
        //         objeto_id: produto.id,
        //         retirada: dataRetirada,
        //         devolucao: dataDevolucao,
        //         token_cartao: "[token gerado pelo gateway de pagamento]"
        //     })
        // });
        // if (!response.ok) throw new Error("Pagamento recusado");
 
        await new Promise(resolve => setTimeout(resolve, 1500)); // simula processamento
        irParaConfirmacao();
    } catch (err) {
        console.error(err);
        alert("Não foi possível processar o pagamento. Verifique os dados e tente novamente.");
        btn.disabled = false;
        btn.textContent = `Pagar R$ ${total}`;
    }
});
 
document.getElementById("btn-pagar-cartao").textContent = `Pagar R$ ${total}`;
 
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
 