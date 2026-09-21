// ================= PROTEGER PÁGINA =================
if (!localStorage.getItem("token")) {
    sessionStorage.setItem("mensagemLogin", "Você precisa estar logado para acessar suas formas de pagamento.");
    window.location.href = "/login";
}

// Cartões vivem no back-end (vinculados ao cliente no gateway).
// O front só exibe: bandeira, últimos 4 dígitos e validade. Número completo
// e CVV são digitados em iframes do Mercado Pago (ver pagamento-gateway.js)
// e nunca passam pelo nosso código.
const API = window.PagamentosAPI;
const Gateway = window.PagamentoGateway;

// ================= LISTA DE CARTÕES =================
const listaCartoesEl = document.getElementById("lista-cartoes");
const statusEl = document.getElementById("cartoes-status");
const btnRecarregar = document.getElementById("btn-recarregar-cartoes");

function mostrarStatus(texto, comRetry = false) {
    statusEl.textContent = texto;
    statusEl.style.display = texto ? "block" : "none";
    btnRecarregar.style.display = comRetry ? "inline-block" : "none";
}

async function carregarCartoes() {
    listaCartoesEl.innerHTML = "";
    mostrarStatus("Carregando seus cartões...");

    let cartoes;
    try {
        cartoes = await API.listarCartoes();
    } catch (erro) {
        mostrarStatus(erro.message || "Não foi possível carregar seus cartões.", true);
        return;
    }

    if (cartoes.length === 0) {
        mostrarStatus("Nenhum cartão cadastrado ainda.");
        return;
    }
    mostrarStatus("");
    renderizarCartoes(cartoes);
}

function criarBotaoAcao(texto, classeExtra, aoClicar) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = `cartao-acao-link ${classeExtra}`.trim();
    btn.textContent = texto;
    btn.addEventListener("click", () => aoClicar(btn));
    return btn;
}

function renderizarCartoes(cartoes) {
    listaCartoesEl.innerHTML = "";

    cartoes.forEach(cartao => {
        const item = document.createElement("div");
        item.className = "cartao-item";

        const icone = document.createElement("div");
        icone.className = "cartao-icone";
        icone.innerHTML = '<i class="bi bi-credit-card-fill"></i>';

        const info = document.createElement("div");
        info.className = "cartao-info";
        const numero = document.createElement("p");
        numero.className = "cartao-numero";
        numero.textContent = `${cartao.bandeira} •••• ${cartao.ultimos_digitos}`;
        const validade = document.createElement("p");
        validade.className = "cartao-validade";
        validade.textContent = `Validade ${cartao.validade}`;
        info.append(numero, validade);

        const acoes = document.createElement("div");
        acoes.className = "cartao-acoes";
        if (cartao.padrao) {
            const badge = document.createElement("span");
            badge.className = "cartao-badge-padrao";
            badge.textContent = "Padrão";
            acoes.appendChild(badge);
        } else {
            acoes.appendChild(criarBotaoAcao("Tornar padrão", "", (btn) => tornarPadrao(cartao.id, btn)));
        }
        acoes.appendChild(criarBotaoAcao("Remover", "remover", () => abrirModalRemover(cartao)));

        item.append(icone, info, acoes);
        listaCartoesEl.appendChild(item);
    });
}

async function tornarPadrao(id, botao) {
    botao.disabled = true;
    try {
        await API.tornarCartaoPadrao(id);
        await carregarCartoes();
    } catch (erro) {
        botao.disabled = false;
        mostrarStatus(erro.message || "Não foi possível alterar o cartão padrão.", false);
    }
}

btnRecarregar.addEventListener("click", carregarCartoes);
carregarCartoes();

// ================= MODAL: ADICIONAR CARTÃO =================
const modalAdicionar = document.getElementById("modal-adicionar-cartao");
const formCartao = document.getElementById("formAdicionarCartao");
const mensagemCartaoEl = document.getElementById("mensagemCartao");
const btnSalvarCartao = document.getElementById("btn-salvar-cartao");
let salvandoCartao = false;

function mostrarMensagemCartao(texto) {
    mensagemCartaoEl.textContent = texto;
    mensagemCartaoEl.className = texto ? "conta-mensagem erro" : "conta-mensagem";
}

function abrirModalAdicionar() {
    formCartao.reset();
    mostrarMensagemCartao("");
    modalAdicionar.classList.add("show");
    try {
        // O modal precisa estar visível antes: os iframes são montados nos <div>.
        Gateway.montarCamposNovoCartao({
            idNumero: "cartaoNumero",
            idValidade: "cartaoValidade",
            idCvv: "cartaoCvv"
        });
    } catch (erro) {
        console.error(erro);
        mostrarMensagemCartao(erro.message);
    }
}

function fecharModalAdicionar() {
    if (salvandoCartao) return;
    modalAdicionar.classList.remove("show");
    Gateway.desmontarTudo();
}

document.getElementById("btn-adicionar-cartao").addEventListener("click", abrirModalAdicionar);
document.getElementById("btn-cancelar-cartao").addEventListener("click", fecharModalAdicionar);
modalAdicionar.addEventListener("click", (e) => {
    if (e.target === modalAdicionar) fecharModalAdicionar();
});

Gateway.ligarMascaraCpf(document.getElementById("cartaoCpf"));

formCartao.addEventListener("submit", async (e) => {
    e.preventDefault();
    if (salvandoCartao) return;
    mostrarMensagemCartao("");

    const titular = document.getElementById("cartaoNome").value.trim();
    const cpf = document.getElementById("cartaoCpf").value;

    // Número, validade e CVV são validados pelo SDK ao tokenizar (estão em iframes).
    if (!titular) return mostrarMensagemCartao("Informe o nome impresso no cartão.");
    if (!Gateway.validarCpf(cpf)) return mostrarMensagemCartao("CPF inválido.");

    salvandoCartao = true;
    btnSalvarCartao.disabled = true;
    btnSalvarCartao.textContent = "Salvando...";

    try {
        const { token } = await Gateway.tokenizarCartaoNovo({ titular, cpf });
        await API.adicionarCartao(token);

        salvandoCartao = false;
        fecharModalAdicionar();
        await carregarCartoes();
    } catch (erro) {
        if (erro instanceof API.ApiError) {
            mostrarMensagemCartao(erro.message);
            // O token é de uso único e já foi consumido: remonta os campos pra digitar de novo.
            try {
                Gateway.montarCamposNovoCartao({ idNumero: "cartaoNumero", idValidade: "cartaoValidade", idCvv: "cartaoCvv" });
            } catch (_) { /* SDK indisponível */ }
        } else {
            const campos = erro.campos || {};
            mostrarMensagemCartao(Object.values(campos)[0] || erro.message);
        }
    } finally {
        salvandoCartao = false;
        btnSalvarCartao.disabled = false;
        btnSalvarCartao.textContent = "Salvar cartão";
    }
});

// ================= MODAL: REMOVER CARTÃO =================
const modalRemover = document.getElementById("modal-remover-cartao");
const textoRemoverEl = document.getElementById("texto-remover-cartao");
const erroRemoverEl = document.getElementById("erro-remover-cartao");
const btnConfirmarRemover = document.getElementById("modal-remover-confirmar");
let idParaRemover = null;
let removendo = false;

function abrirModalRemover(cartao) {
    idParaRemover = cartao.id;
    erroRemoverEl.textContent = "";
    textoRemoverEl.textContent = `Remover o cartão terminado em ${cartao.ultimos_digitos}?`;
    modalRemover.classList.add("show");
}

function fecharModalRemover() {
    if (removendo) return;
    modalRemover.classList.remove("show");
    idParaRemover = null;
}

document.getElementById("modal-remover-voltar").addEventListener("click", fecharModalRemover);
modalRemover.addEventListener("click", (e) => {
    if (e.target === modalRemover) fecharModalRemover();
});

btnConfirmarRemover.addEventListener("click", async () => {
    if (!idParaRemover || removendo) return;
    removendo = true;
    btnConfirmarRemover.disabled = true;
    erroRemoverEl.textContent = "";

    try {
        // Regras (não remover o único cartão com aluguel em andamento; promover
        // outro cartão a padrão) são do back-end — ele responde 409 com a mensagem.
        await API.removerCartao(idParaRemover);
        removendo = false;
        fecharModalRemover();
        await carregarCartoes();
    } catch (erro) {
        erroRemoverEl.textContent = erro.message;
    } finally {
        removendo = false;
        btnConfirmarRemover.disabled = false;
    }
});

// ================= ESC FECHA OS MODAIS =================
document.addEventListener("keydown", (e) => {
    if (e.key !== "Escape") return;
    if (modalAdicionar.classList.contains("show")) fecharModalAdicionar();
    if (modalRemover.classList.contains("show")) fecharModalRemover();
});