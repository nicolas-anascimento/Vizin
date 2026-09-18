// ================= PROTEGER PÁGINA =================
if (!localStorage.getItem("token")) {
    window.location.href = "../Login/index.html";
}

// ================= LER DADOS DA URL =================
const params = new URLSearchParams(window.location.search);
const solicitacaoId = params.get("solicitacaoId");

document.getElementById("link-voltar").addEventListener("click", (e) => {
    e.preventDefault();
    window.location.href = solicitacaoId
        ? `../Status-locacao/index.html?solicitacaoId=${solicitacaoId}`
        : "../Historico/index.html";
});

// ================= USUÁRIO ATUAL =================
// Mesmo critério usado em finalizar-pagamento.js/notificacoes-shared.js: o
// e-mail do usuário logado (salvo pelo Login) é o identificador usado nas
// solicitações.
function usuarioAtual() {
    const usuario = JSON.parse(localStorage.getItem("usuario") || "null");
    return usuario?.email || null;
}

// ================= CARTÕES SALVOS (Forma de Pagamento) =================
// Mesma chave/formato usada em Forma-de-pagamento/pagamento.js e em
// finalizar-pagamento.js — deixa escolher um cartão já cadastrado aqui
// também, em vez de forçar redigitar tudo.
const CHAVE_CARTOES = `vizin_cartoes_${usuarioAtual() || "anonimo"}`;

function obterCartoesSalvos() {
    return JSON.parse(localStorage.getItem(CHAVE_CARTOES) || "[]");
}

// ================= CONTROLE DE TELAS =================
const telas = {
    pagamento: document.getElementById("tela-pagamento"),
    erroSolicitacao: document.getElementById("tela-erro-solicitacao"),
};
const sidebar = document.getElementById("pagamento-sidebar");

function mostrarTela(nome) {
    Object.values(telas).forEach(el => el && (el.style.display = "none"));
    if (telas[nome]) telas[nome].style.display = "block";
    if (sidebar) sidebar.style.display = nome === "pagamento" ? "" : "none";
}

document.getElementById("btn-erro-solicitacao-voltar")?.addEventListener("click", () => {
    window.location.href = "../Historico/index.html";
});

// ================= LEITURA E VALIDAÇÃO DA MULTA =================
// PONTO DE INTEGRAÇÃO COM O BACK-END:
// O ideal é esta página também fazer GET /api/solicitacoes/:id no servidor,
// e o back-end recusar (403/404) se a solicitação não existir, não for do
// usuário logado, ou não tiver multa pendente — a checagem abaixo é só a
// simulação client-side equivalente.
let solicitacaoAtual = null;

function validarSolicitacao() {
    if (!solicitacaoId || !window.SolicitacoesVizin) {
        document.getElementById("erro-solicitacao-texto").textContent =
            "Não foi possível identificar a locação desta cobrança.";
        mostrarTela("erroSolicitacao");
        return false;
    }

    const solicitacao = window.SolicitacoesVizin.obterPorId(Number(solicitacaoId));

    if (!solicitacao) {
        document.getElementById("erro-solicitacao-texto").textContent =
            "Esta solicitação não existe ou não está mais disponível.";
        mostrarTela("erroSolicitacao");
        return false;
    }

    const usuario = usuarioAtual();
    if (usuario && solicitacao.solicitanteEmail && solicitacao.solicitanteEmail !== usuario) {
        document.getElementById("erro-solicitacao-texto").textContent =
            "Esta cobrança não pertence à sua conta.";
        mostrarTela("erroSolicitacao");
        return false;
    }

    if (!solicitacao.multaAtraso || solicitacao.multaAtraso.diasAtraso <= 0) {
        document.getElementById("erro-solicitacao-texto").textContent =
            "Esta locação não tem nenhuma multa por atraso registrada.";
        mostrarTela("erroSolicitacao");
        return false;
    }

    if (solicitacao.multaStatus === "paga") {
        document.getElementById("erro-solicitacao-texto").textContent =
            "Esta multa já foi paga anteriormente.";
        mostrarTela("erroSolicitacao");
        return false;
    }

    solicitacaoAtual = solicitacao;
    return true;
}

// ================= RESUMO =================
function preencherResumo() {
    const s = solicitacaoAtual;
    const multa = s.multaAtraso;

    document.getElementById("resumo-imagem").src = s.imagemProduto || "../img/sem-imagem.jpg";
    document.getElementById("resumo-imagem").alt = s.produtoTitulo || "";
    document.getElementById("resumo-produto-nome").textContent = s.produtoTitulo || "";
    document.getElementById("resumo-produto-categoria").textContent = s.categoriaProduto || "";

    document.getElementById("resumo-dias-atraso").textContent =
        `${multa.diasAtraso} dia${multa.diasAtraso > 1 ? "s" : ""}`;
    document.getElementById("resumo-valor-dia").textContent =
        formatarPreco(window.SolicitacoesVizin.MULTA_POR_DIA_ATRASO);
    document.getElementById("resumo-total").textContent = formatarPreco(multa.valorTotal);

    document.getElementById("pix-valor").textContent = formatarPreco(multa.valorTotal);
    document.getElementById("btn-pagar-cartao").textContent = `Pagar ${formatarPreco(multa.valorTotal)}`;

    gerarCodigoPix();
}

function gerarCodigoPix() {
    // Código PIX fictício de exemplo — o back-end deve gerar o código real
    // (copia e cola) junto com o QR Code ao criar a cobrança.
    const aleatorio = Math.floor(Math.random() * 1e10).toString().padStart(10, "0");
    document.getElementById("pix-codigo").value =
        `vizin.app.pix.${aleatorio.repeat(4)}`.slice(0, 70);
}

// ================= SELEÇÃO DO MÉTODO DE PAGAMENTO =================
const btnPix = document.getElementById("metodo-pix");
const btnCartao = document.getElementById("metodo-cartao");
const conteudoPix = document.getElementById("conteudo-pix");
const conteudoCartao = document.getElementById("conteudo-cartao");
const metodoVazio = document.getElementById("metodo-vazio");
const pixBox = document.getElementById("pix-box");
const pixExpiradoEl = document.getElementById("pix-expirado");
const pixAguardando = document.getElementById("pix-aguardando");

function selecionarMetodo(metodo) {
    btnPix.classList.toggle("ativo", metodo === "pix");
    btnCartao.classList.toggle("ativo", metodo === "cartao");
    conteudoPix.style.display = metodo === "pix" ? "block" : "none";
    conteudoCartao.style.display = metodo === "cartao" ? "block" : "none";
    metodoVazio.style.display = "none";
    esconderErroCartao();

    if (metodo === "pix") {
        iniciarFluxoPix();
    } else {
        pararTimerPix();
        pararPollingPix();
    }
}

btnPix.addEventListener("click", () => selecionarMetodo("pix"));
btnCartao.addEventListener("click", () => selecionarMetodo("cartao"));

document.getElementById("btn-tentar-outro-metodo")?.addEventListener("click", () => {
    esconderErroCartao();
    btnPix.classList.remove("ativo");
    btnCartao.classList.remove("ativo");
    conteudoPix.style.display = "none";
    conteudoCartao.style.display = "none";
    metodoVazio.style.display = "block";
    pararTimerPix();
    pararPollingPix();
});

// ================= COPIAR CÓDIGO PIX =================
document.getElementById("btn-copiar-pix").addEventListener("click", () => {
    const campo = document.getElementById("pix-codigo");
    navigator.clipboard.writeText(campo.value).then(() => {
        mostrarToast("Código PIX copiado");
    });
});

// ================= TIMER / EXPIRAÇÃO DO PIX =================
// Mesma simulação de finalizar-pagamento.js — o botão de "simular" existe só
// pra testar o fluxo sem um back-end real e pode ser removido na integração.
const PIX_DURACAO_MIN = 30;
let pixInterval = null;
let pixPollingTimeout = null;

function iniciarFluxoPix() {
    pixExpiradoEl.style.display = "none";
    pixBox.style.display = "block";
    iniciarTimerPix();
    iniciarPollingPix();
}

function iniciarTimerPix() {
    pararTimerPix();
    const limite = Date.now() + PIX_DURACAO_MIN * 60 * 1000;
    const timerEl = document.getElementById("pix-timer");
    const tempoEl = document.getElementById("pix-timer-tempo");

    function tick() {
        const restanteMs = limite - Date.now();
        if (restanteMs <= 0) {
            pararTimerPix();
            pararPollingPix();
            pixBox.style.display = "none";
            pixExpiradoEl.style.display = "block";
            return;
        }
        const min = Math.floor(restanteMs / 60000);
        const seg = Math.floor((restanteMs % 60000) / 1000);
        tempoEl.textContent = `${String(min).padStart(2, "0")}:${String(seg).padStart(2, "0")}`;
        timerEl.classList.toggle("pix-timer-urgente", restanteMs < 5 * 60 * 1000);
    }

    tick();
    pixInterval = setInterval(tick, 1000);
}

function pararTimerPix() {
    if (pixInterval) clearInterval(pixInterval);
    pixInterval = null;
}

function iniciarPollingPix() {
    pararPollingPix();
    pixAguardando.style.display = "block";
    // Simula o webhook do banco confirmando o pagamento depois de um tempo.
    // Em produção: GET /api/pagamentos/:id/status em polling (ou
    // WebSocket/SSE), nunca um botão manual do usuário.
    pixPollingTimeout = setTimeout(() => {
        confirmarPagamento();
    }, 9000);
}

function pararPollingPix() {
    if (pixPollingTimeout) clearTimeout(pixPollingTimeout);
    pixPollingTimeout = null;
    if (pixAguardando) pixAguardando.style.display = "none";
}

document.getElementById("btn-simular-pix")?.addEventListener("click", () => {
    pararPollingPix();
    confirmarPagamento();
});

document.getElementById("btn-gerar-novo-pix").addEventListener("click", () => {
    gerarCodigoPix();
    iniciarFluxoPix();
});

// ================= TRAVA CONTRA CLIQUE DUPLO / PAGAMENTO EM DOBRO =================
let pagamentoEmProcessamento = false;

// ================= CONFIRMAÇÃO DO PAGAMENTO DA MULTA =================
// PONTO DE INTEGRAÇÃO COM O BACK-END:
// Isso deve acontecer no servidor, disparado pela confirmação real do
// gateway de pagamento (webhook), não no clique/timeout do front-end. O
// servidor também deve garantir idempotência (não permitir pagar a mesma
// multa duas vezes).
//
// Depois de paga, a locação já estava "concluida" (a multa nunca bloqueou
// esse status — ver comentário em solicitacoes-shared.js) — então o fluxo
// simplesmente segue pra próxima etapa de sempre: avaliar a locação.
function confirmarPagamento() {
    if (pagamentoEmProcessamento) return; // trava contra clique/confirmação duplicada
    pagamentoEmProcessamento = true;

    window.SolicitacoesVizin.pagarMulta(Number(solicitacaoId));

    window.location.href = `../Avaliacao/index.html?solicitacaoId=${solicitacaoId}`;
}

// ================= PAGAR COM CARTÃO =================
const formCartao = document.getElementById("form-cartao");
const btnPagarCartao = document.getElementById("btn-pagar-cartao");
const cartaoErroGeral = document.getElementById("cartao-erro-geral");
const cartaoErroGeralTexto = document.getElementById("cartao-erro-geral-texto");
const cartaoAcoesErro = document.getElementById("cartao-acoes-erro");

// ---- seleção de cartão salvo vs. digitação manual ----
const cartoesSalvosSecao = document.getElementById("cartoes-salvos-secao");
const cartoesSalvosLista = document.getElementById("cartoes-salvos-lista");
const camposCartaoNovo = document.getElementById("campos-cartao-novo");
const btnUsarOutroCartao = document.getElementById("btn-usar-outro-cartao");
const btnUsarCartaoSalvo = document.getElementById("btn-usar-cartao-salvo");

let cartaoSalvoSelecionadoId = null;

function renderizarCartoesSalvos() {
    const cartoes = obterCartoesSalvos();

    if (cartoes.length === 0) {
        cartoesSalvosSecao.style.display = "none";
        camposCartaoNovo.style.display = "block";
        btnUsarCartaoSalvo.style.display = "none";
        cartaoSalvoSelecionadoId = null;
        return;
    }

    cartoesSalvosLista.innerHTML = "";

    cartoes.forEach(cartao => {
        const opcao = document.createElement("label");
        opcao.className = "cartao-salvo-opcao";
        opcao.innerHTML = `
            <input type="radio" name="cartao-salvo-radio" value="${cartao.id}">
            <div class="cartao-salvo-icone"><i class="bi bi-credit-card-fill"></i></div>
            <div class="cartao-salvo-info">
                <p class="cartao-salvo-numero">${cartao.bandeira} •••• ${cartao.ultimosDigitos}</p>
                <p class="cartao-salvo-validade">Validade ${cartao.validade}</p>
            </div>
            ${cartao.padrao ? '<span class="cartao-salvo-badge-padrao">Padrão</span>' : ""}
        `;
        cartoesSalvosLista.appendChild(opcao);
    });

    const cartaoInicial = cartoes.find(c => c.padrao) || cartoes[0];
    selecionarCartaoSalvo(cartaoInicial.id);

    cartoesSalvosLista.querySelectorAll('input[name="cartao-salvo-radio"]').forEach(radio => {
        radio.addEventListener("change", () => selecionarCartaoSalvo(radio.value));
    });

    cartoesSalvosSecao.style.display = "block";
    camposCartaoNovo.style.display = "none";
    btnUsarCartaoSalvo.style.display = "inline-block";
}

function selecionarCartaoSalvo(id) {
    cartaoSalvoSelecionadoId = id;
    cartoesSalvosLista.querySelectorAll(".cartao-salvo-opcao").forEach(opcao => {
        const radio = opcao.querySelector('input[type="radio"]');
        radio.checked = radio.value === id;
        opcao.classList.toggle("selecionado", radio.value === id);
    });
    esconderErroCartao();
}

btnUsarOutroCartao?.addEventListener("click", () => {
    cartaoSalvoSelecionadoId = null;
    cartoesSalvosSecao.style.display = "none";
    camposCartaoNovo.style.display = "block";
    btnUsarCartaoSalvo.style.display = obterCartoesSalvos().length > 0 ? "inline-block" : "none";
    esconderErroCartao();
});

btnUsarCartaoSalvo?.addEventListener("click", () => {
    renderizarCartoesSalvos();
});

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

// ---- validação real dos dados do cartão ----
function algoritmoLuhnValido(numero) {
    const digitos = numero.replace(/\D/g, "");
    if (digitos.length < 13) return false;
    let soma = 0;
    let dobrar = false;
    for (let i = digitos.length - 1; i >= 0; i--) {
        let d = Number(digitos[i]);
        if (dobrar) {
            d *= 2;
            if (d > 9) d -= 9;
        }
        soma += d;
        dobrar = !dobrar;
    }
    return soma % 10 === 0;
}

function validadeNoFuturo(validade) {
    const match = validade.match(/^(\d{2})\/(\d{2})$/);
    if (!match) return false;
    const mes = Number(match[1]);
    const ano = 2000 + Number(match[2]);
    if (mes < 1 || mes > 12) return false;
    const fimDoMes = new Date(ano, mes, 0, 23, 59, 59);
    return fimDoMes >= new Date();
}

function definirErroCampo(idCampo, idErro, mensagem) {
    const input = document.getElementById(idCampo);
    const erroEl = document.getElementById(idErro);
    input.classList.toggle("input-erro", Boolean(mensagem));
    erroEl.textContent = mensagem || "";
}

function limparErrosCampos() {
    definirErroCampo("cartao-numero", "erro-cartao-numero", "");
    definirErroCampo("cartao-nome", "erro-cartao-nome", "");
    definirErroCampo("cartao-validade", "erro-cartao-validade", "");
    definirErroCampo("cartao-cvv", "erro-cartao-cvv", "");
}

function esconderErroCartao() {
    cartaoErroGeral.style.display = "none";
    cartaoAcoesErro.style.display = "none";
    limparErrosCampos();
}

function mostrarErroGeralCartao(mensagem) {
    cartaoErroGeralTexto.textContent = mensagem;
    cartaoErroGeral.style.display = "flex";
    cartaoAcoesErro.style.display = "flex";
}

function validarCampoCartao() {
    limparErrosCampos();
    let valido = true;

    const numero = document.getElementById("cartao-numero").value.trim();
    const nome = document.getElementById("cartao-nome").value.trim();
    const validade = document.getElementById("cartao-validade").value.trim();
    const cvv = document.getElementById("cartao-cvv").value.trim();

    if (!algoritmoLuhnValido(numero)) {
        definirErroCampo("cartao-numero", "erro-cartao-numero", "Número de cartão inválido.");
        valido = false;
    }
    if (!nome) {
        definirErroCampo("cartao-nome", "erro-cartao-nome", "Informe o nome como está no cartão.");
        valido = false;
    }
    if (!validadeNoFuturo(validade)) {
        definirErroCampo("cartao-validade", "erro-cartao-validade", "Validade inválida ou expirada.");
        valido = false;
    }
    if (cvv.length < 3) {
        definirErroCampo("cartao-cvv", "erro-cartao-cvv", "CVV inválido.");
        valido = false;
    }

    return valido;
}

document.getElementById("btn-tentar-outro-cartao").addEventListener("click", () => {
    formCartao.reset();
    esconderErroCartao();
    document.getElementById("cartao-numero").focus();
});

formCartao.addEventListener("submit", async (e) => {
    e.preventDefault();
    if (pagamentoEmProcessamento) return;

    esconderErroCartao();

    const usandoCartaoSalvo = Boolean(cartaoSalvoSelecionadoId);
    if (!usandoCartaoSalvo && !validarCampoCartao()) return;

    btnPagarCartao.disabled = true;
    btnPagarCartao.innerHTML = `<span class="spinner"></span> Processando...`;

    try {
        // PONTO DE INTEGRAÇÃO COM O BACK-END:
        // ATENÇÃO: nunca envie os dados do cartão em texto puro para um
        // back-end próprio. O ideal é usar a tokenização de um gateway de
        // pagamento (Stripe, Pagar.me, etc.) no próprio front-end, e enviar
        // apenas o token gerado — mesmo padrão de finalizar-pagamento.js:
        //
        // const response = await fetch("/api/multas/:solicitacaoId/pagar", {
        //     method: "POST",
        //     headers: {
        //         "Content-Type": "application/json",
        //         "Authorization": `Bearer ${localStorage.getItem("token")}`
        //     },
        //     body: JSON.stringify({ token_cartao: "[token gerado pelo gateway de pagamento]" })
        // });
        // if (!response.ok) {
        //     const erro = await response.json();
        //     throw new Error(erro.mensagem || "Pagamento recusado");
        // }

        await new Promise(resolve => setTimeout(resolve, 1500)); // simula processamento

        confirmarPagamento();
    } catch (err) {
        console.error(err);
        mostrarErroGeralCartao(err.message || "Não foi possível processar o pagamento. Verifique os dados e tente novamente.");
        pagamentoEmProcessamento = false;
        btnPagarCartao.disabled = false;
        btnPagarCartao.textContent = `Pagar ${formatarPreco(solicitacaoAtual.multaAtraso.valorTotal)}`;
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

// ================= INICIALIZAÇÃO DA PÁGINA =================
(function iniciar() {
    if (!validarSolicitacao()) return;
    mostrarTela("pagamento");
    preencherResumo();
    renderizarCartoesSalvos();
})();