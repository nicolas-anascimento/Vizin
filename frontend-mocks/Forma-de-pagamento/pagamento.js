// ================= PROTEGER PÁGINA =================
if (!localStorage.getItem("token")) {
    sessionStorage.setItem("mensagemLogin", "Você precisa estar logado para acessar suas formas de pagamento.");
    window.location.href = "../Login/index.html";
}
 
const usuarioSalvo = JSON.parse(localStorage.getItem("usuario") || "null") || {};
const emailUsuario = usuarioSalvo.email || "anonimo";
const CHAVE_CARTOES = `vizin_cartoes_${emailUsuario}`;
 
// PONTO DE INTEGRAÇÃO COM O BACK-END:
// Nunca armazenar número completo/CVV — isso é tokenizado por um gateway
// de pagamento de verdade (Stripe, Pagar.me etc.), que devolve só um
// token + os 4 últimos dígitos pra exibição. Aqui, no mock, já seguimos
// essa regra: só guardamos os últimos 4 dígitos, a bandeira e a validade.
function obterCartoes() {
    return JSON.parse(localStorage.getItem(CHAVE_CARTOES) || "[]");
}
 
function salvarCartoes(cartoes) {
    localStorage.setItem(CHAVE_CARTOES, JSON.stringify(cartoes));
}
 
function detectarBandeira(numero) {
    if (/^4/.test(numero)) return "Visa";
    if (/^5[1-5]/.test(numero)) return "Mastercard";
    if (/^3[47]/.test(numero)) return "Amex";
    return "Cartão";
}
 
// Validação de Luhn — checa se o número "faz sentido" matematicamente,
// sem processar pagamento nenhum (isso fica com o gateway de verdade).
function validarLuhn(numero) {
    let soma = 0;
    let alternar = false;
    for (let i = numero.length - 1; i >= 0; i--) {
        let d = parseInt(numero.charAt(i), 10);
        if (alternar) {
            d *= 2;
            if (d > 9) d -= 9;
        }
        soma += d;
        alternar = !alternar;
    }
    return soma % 10 === 0;
}
 
function validarValidade(validade) {
    const match = /^(\d{2})\/(\d{2})$/.exec(validade);
    if (!match) return false;
    const mes = parseInt(match[1], 10);
    const ano = 2000 + parseInt(match[2], 10);
    if (mes < 1 || mes > 12) return false;
 
    const hoje = new Date();
    const expira = new Date(ano, mes, 1);
    return expira > hoje;
}
 
// ================= RENDERIZAR LISTA =================
const listaCartoesEl = document.getElementById("lista-cartoes");
const cartoesVazioEl = document.getElementById("cartoes-vazio");
 
function renderizarCartoes() {
    const cartoes = obterCartoes();
    listaCartoesEl.innerHTML = "";
 
    if (cartoes.length === 0) {
        cartoesVazioEl.style.display = "block";
        return;
    }
    cartoesVazioEl.style.display = "none";
 
    cartoes.forEach(cartao => {
        const item = document.createElement("div");
        item.className = "cartao-item";
        item.innerHTML = `
            <div class="cartao-icone"><i class="bi bi-credit-card-fill"></i></div>
            <div class="cartao-info">
                <p class="cartao-numero">${cartao.bandeira} •••• ${cartao.ultimosDigitos}</p>
                <p class="cartao-validade">Validade ${cartao.validade}</p>
            </div>
            <div class="cartao-acoes">
                ${cartao.padrao ? '<span class="cartao-badge-padrao">Padrão</span>' : `<button type="button" class="cartao-acao-link" data-tornar-padrao="${cartao.id}">Tornar padrão</button>`}
                <button type="button" class="cartao-acao-link remover" data-remover="${cartao.id}">Remover</button>
            </div>
        `;
        listaCartoesEl.appendChild(item);
    });
 
    listaCartoesEl.querySelectorAll("[data-tornar-padrao]").forEach(btn => {
        btn.addEventListener("click", () => tornarPadrao(btn.dataset.tornarPadrao));
    });
    listaCartoesEl.querySelectorAll("[data-remover]").forEach(btn => {
        btn.addEventListener("click", () => abrirModalRemover(btn.dataset.remover));
    });
}
 
function tornarPadrao(id) {
    const cartoes = obterCartoes().map(c => ({ ...c, padrao: c.id === id }));
    salvarCartoes(cartoes);
    renderizarCartoes();
}
 
renderizarCartoes();
 
// ================= MODAL: ADICIONAR CARTÃO =================
const modalAdicionar = document.getElementById("modal-adicionar-cartao");
const formCartao = document.getElementById("formAdicionarCartao");
const mensagemCartaoEl = document.getElementById("mensagemCartao");
 
document.getElementById("btn-adicionar-cartao").addEventListener("click", () => {
    formCartao.reset();
    mensagemCartaoEl.textContent = "";
    modalAdicionar.classList.add("show");
});
 
document.getElementById("btn-cancelar-cartao").addEventListener("click", () => {
    modalAdicionar.classList.remove("show");
});
 
modalAdicionar.addEventListener("click", (e) => {
    if (e.target === modalAdicionar) modalAdicionar.classList.remove("show");
});
 
document.getElementById("cartaoNumero").addEventListener("input", (e) => {
    const numeros = e.target.value.replace(/\D/g, "").slice(0, 16);
    e.target.value = numeros.replace(/(\d{4})(?=\d)/g, "$1 ");
});
 
document.getElementById("cartaoValidade").addEventListener("input", (e) => {
    let v = e.target.value.replace(/\D/g, "").slice(0, 4);
    if (v.length > 2) v = v.slice(0, 2) + "/" + v.slice(2);
    e.target.value = v;
});
 
formCartao.addEventListener("submit", (e) => {
    e.preventDefault();
 
    const numeroLimpo = document.getElementById("cartaoNumero").value.replace(/\D/g, "");
    const nome = document.getElementById("cartaoNome").value.trim();
    const validade = document.getElementById("cartaoValidade").value.trim();
    const cvv = document.getElementById("cartaoCvv").value.trim();
 
    if (numeroLimpo.length < 13 || !validarLuhn(numeroLimpo)) {
        mensagemCartaoEl.textContent = "Número de cartão inválido.";
        mensagemCartaoEl.className = "conta-mensagem erro";
        return;
    }
    if (!nome) {
        mensagemCartaoEl.textContent = "Informe o nome impresso no cartão.";
        mensagemCartaoEl.className = "conta-mensagem erro";
        return;
    }
    if (!validarValidade(validade)) {
        mensagemCartaoEl.textContent = "Validade inválida ou cartão vencido.";
        mensagemCartaoEl.className = "conta-mensagem erro";
        return;
    }
    if (cvv.length < 3) {
        mensagemCartaoEl.textContent = "CVV inválido.";
        mensagemCartaoEl.className = "conta-mensagem erro";
        return;
    }
 
    // PONTO DE INTEGRAÇÃO COM O BACK-END:
    // O número completo e o CVV são enviados direto pro gateway de
    // pagamento (nunca pro nosso back-end), que devolve um token seguro.
    // Aqui simulamos isso guardando só os últimos 4 dígitos.
    const cartoes = obterCartoes();
    const novoCartao = {
        id: `card_${Date.now()}`,
        bandeira: detectarBandeira(numeroLimpo),
        ultimosDigitos: numeroLimpo.slice(-4),
        validade,
        padrao: cartoes.length === 0
    };
 
    cartoes.push(novoCartao);
    salvarCartoes(cartoes);
    renderizarCartoes();
    modalAdicionar.classList.remove("show");
});
 
// ================= MODAL: REMOVER CARTÃO =================
const modalRemover = document.getElementById("modal-remover-cartao");
const textoRemoverEl = document.getElementById("texto-remover-cartao");
let idParaRemover = null;
 
function abrirModalRemover(id) {
    const cartoes = obterCartoes();
    const cartao = cartoes.find(c => c.id === id);
    if (!cartao) return;
 
    idParaRemover = id;
 
    // Edge case: não deixa remover o único cartão se houver um aluguel em
    // andamento como locatário que dependa de pagamento recorrente.
    const unicoCartao = cartoes.length === 1;
    const STATUS_EM_ANDAMENTO = ["aprovado", "pago", "retirado", "aguardando_devolucao"];
    const temAluguelAtivo = window.SolicitacoesVizin
        ? window.SolicitacoesVizin.obterTodas().some(s => s.solicitanteEmail === emailUsuario && STATUS_EM_ANDAMENTO.includes(s.status))
        : false;
 
    if (unicoCartao && temAluguelAtivo) {
        alert("Você tem um aluguel em andamento e precisa de pelo menos uma forma de pagamento cadastrada. Adicione outro cartão antes de remover este.");
        return;
    }
 
    textoRemoverEl.textContent = `Remover o cartão terminado em ${cartao.ultimosDigitos}?`;
    modalRemover.classList.add("show");
}
 
document.getElementById("modal-remover-voltar").addEventListener("click", () => {
    modalRemover.classList.remove("show");
    idParaRemover = null;
});
 
modalRemover.addEventListener("click", (e) => {
    if (e.target === modalRemover) modalRemover.classList.remove("show");
});
 
document.getElementById("modal-remover-confirmar").addEventListener("click", () => {
    if (!idParaRemover) return;
 
    let cartoes = obterCartoes().filter(c => c.id !== idParaRemover);
 
    // Se removeu o cartão padrão e ainda sobrou algum, promove o primeiro.
    if (cartoes.length > 0 && !cartoes.some(c => c.padrao)) {
        cartoes[0].padrao = true;
    }
 
    salvarCartoes(cartoes);
    renderizarCartoes();
    modalRemover.classList.remove("show");
    idParaRemover = null;
});
 