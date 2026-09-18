// ================= PROTEGER PÁGINA =================
if (!localStorage.getItem("token")) {
    window.location.href = "../Login/index.html";
}
 
// ================= LER DADOS DA URL =================
const params = new URLSearchParams(window.location.search);
const produtoId = params.get("produtoId") || "1";
const dataRetirada = params.get("retirada");
const dataDevolucao = params.get("devolucao");
const solicitacaoId = params.get("solicitacaoId");
 
document.getElementById("link-voltar").addEventListener("click", (e) => {
    e.preventDefault();
    window.location.href = `../Produto/index.html?id=${produtoId}`;
});
 
// ================= USUÁRIO ATUAL =================
// Mesmo critério usado em notificacoes-shared.js: o e-mail do usuário
// logado (salvo pelo Login) é o identificador usado nas solicitações.
function usuarioAtual() {
    const usuario = JSON.parse(localStorage.getItem("usuario") || "null");
    return usuario?.email || null;
}
 
// ================= CARTÕES SALVOS (Forma de Pagamento) =================
// Mesma chave/formato usada em Forma-de-pagamento/pagamento.js — lemos os
// cartões já cadastrados pra deixar escolher um deles aqui no checkout,
// em vez de forçar redigitar tudo toda vez.
const CHAVE_CARTOES = `vizin_cartoes_${usuarioAtual() || "anonimo"}`;
 
function obterCartoesSalvos() {
    return JSON.parse(localStorage.getItem(CHAVE_CARTOES) || "[]");
}
 
// ================= MOCK DO PRODUTO (fallback) =================
// PONTO DE INTEGRAÇÃO COM O BACK-END:
// Buscar o objeto real via GET /api/objetos/:id (mesmo endpoint da página de produto).
// Usado só como fallback quando a solicitação real não é encontrada
// (ex: acesso direto sem solicitacaoId, em ambiente de teste).
const produto = {
    id: produtoId,
    titulo: "Furadeira Profissional Bosch",
    categoria: "Ferramentas",
    preco_dia: 35,
    imagem: "../img/sem-imagem.jpg"
};
 
// ================= CONTROLE DE TELAS =================
const telas = {
    pagamento: document.getElementById("tela-pagamento"),
    erroSolicitacao: document.getElementById("tela-erro-solicitacao"),
    objetoIndisponivel: document.getElementById("tela-objeto-indisponivel"),
    prazoExpirado: document.getElementById("tela-prazo-expirado"),
};
const sidebar = document.getElementById("pagamento-sidebar");
const bannerPrazo = document.getElementById("banner-prazo");
 
function mostrarTela(nome) {
    Object.values(telas).forEach(el => el && (el.style.display = "none"));
    if (telas[nome]) telas[nome].style.display = "block";
    const ehTelaFinal = nome !== "pagamento";
    if (sidebar) sidebar.style.display = ehTelaFinal ? "none" : "";
    if (bannerPrazo && ehTelaFinal) bannerPrazo.style.display = "none";
}
 
document.getElementById("btn-erro-solicitacao-voltar")?.addEventListener("click", () => {
    window.location.href = "../Notificacoes/index.html";
});
document.getElementById("btn-objeto-indisponivel-voltar")?.addEventListener("click", () => {
    window.location.href = "../Produto/index.html";
});
document.getElementById("btn-prazo-expirado-voltar")?.addEventListener("click", () => {
    window.location.href = `../Produto/index.html?id=${produtoId}`;
});
 
// ================= LEITURA E VALIDAÇÃO DA SOLICITAÇÃO =================
// Usa a API real de solicitacoes-shared.js (window.SolicitacoesVizin.obterPorId).
// PONTO DE INTEGRAÇÃO COM O BACK-END:
// O ideal é que esta página também faça GET /api/solicitacoes/:id no
// servidor, e o próprio back-end recuse (403/404) se a solicitação não
// existir, não for do usuário logado, ou não estiver com status "aprovado" —
// a checagem abaixo é só a simulação client-side equivalente.
let solicitacaoAtual = null;
 
function obterSolicitacao(id) {
    if (!id || !window.SolicitacoesVizin) return null;
    return window.SolicitacoesVizin.obterPorId(Number(id));
}
 
function validarSolicitacao() {
    if (!solicitacaoId) return true; // acesso sem solicitacaoId (fluxo antigo/teste) — segue liberado
    if (!window.SolicitacoesVizin) return true; // módulo não carregado nesta página por algum motivo
 
    const solicitacao = obterSolicitacao(solicitacaoId);
 
    if (!solicitacao) {
        document.getElementById("erro-solicitacao-texto").textContent =
            "Esta solicitação não existe ou não está mais disponível.";
        mostrarTela("erroSolicitacao");
        return false;
    }
 
    const usuario = usuarioAtual();
    if (usuario && solicitacao.solicitanteEmail && solicitacao.solicitanteEmail !== usuario) {
        document.getElementById("erro-solicitacao-texto").textContent =
            "Esta solicitação não pertence à sua conta.";
        mostrarTela("erroSolicitacao");
        return false;
    }
 
    if (solicitacao.status === "pago" || solicitacao.status === "concluido" || solicitacao.status === "retirado" || solicitacao.status === "aguardando_devolucao") {
        document.getElementById("erro-solicitacao-texto").textContent =
            "Esta solicitação já foi paga anteriormente.";
        mostrarTela("erroSolicitacao");
        return false;
    }
    if (solicitacao.status === "cancelado" || solicitacao.status === "rejeitado") {
        document.getElementById("erro-solicitacao-texto").textContent =
            "Esta solicitação foi cancelada e não está mais disponível para pagamento.";
        mostrarTela("erroSolicitacao");
        return false;
    }
    if (solicitacao.status !== "aprovado") {
        document.getElementById("erro-solicitacao-texto").textContent =
            "Esta solicitação ainda não está aprovada para pagamento.";
        mostrarTela("erroSolicitacao");
        return false;
    }
 
    solicitacaoAtual = solicitacao;
    return true;
}
 
// ================= CHECAGEM DE DISPONIBILIDADE DO OBJETO =================
// PONTO DE INTEGRAÇÃO COM O BACK-END:
// Checar disponibilidade real no servidor antes de processar o pagamento
// (idealmente de novo, no momento exato da confirmação — não só ao abrir a
// página). Aqui usamos window.ObjetosVizin quando disponível — o objeto já
// deveria estar marcado indisponível desde a aprovação (ver "responder" em
// solicitacoes-shared.js), então isso normalmente só pega o caso do dono
// ter pausado o anúncio por outro motivo depois da aprovação.
function objetoAindaDisponivel() {
    if (!window.ObjetosVizin || typeof window.ObjetosVizin.obterPorId !== "function") return true;
    try {
        const objeto = window.ObjetosVizin.obterPorId(Number(produtoId));
        return !objeto || objeto.disponivel !== false;
    } catch (e) {
        return true; // getter indisponível/incompatível: não bloqueia o pagamento por aqui
    }
}
 
// ================= PRAZO GERAL PARA PAGAR =================
// O prazo é a própria data de retirada combinada na aprovação: dá pra pagar
// a qualquer momento até o fim daquele dia. Se a data de retirada chegar ao
// fim sem pagamento, a solicitação é cancelada automaticamente (mesmo
// critério de "dia" usado em solicitacoes-shared.js: cancela quando a data
// de retirada já passou, não durante o próprio dia dela).
//
// PONTO DE INTEGRAÇÃO COM O BACK-END:
// O cancelamento por prazo já está implementado como regra de negócio em
// solicitacoes-shared.js (verificarPrazos, rodando em polling a cada 60s) —
// isso deve virar um job agendado no servidor. O timer abaixo só existe pra
// mostrar a contagem regressiva nesta tela e reagir na hora, sem esperar o
// próximo tick do polling.
let prazoInterval = null;
 
function parseDataISOLocal(dataStr) {
    if (!dataStr) return null;
    const partes = dataStr.split("-").map(Number);
    if (partes.length !== 3 || partes.some(Number.isNaN)) return null;
    const [ano, mes, dia] = partes;
    return new Date(ano, mes - 1, dia);
}
 
function obterPrazoLimite() {
    const dataLimite = parseDataISOLocal(retiradaExibida);
    if (!dataLimite) return null; // sem data de retirada conhecida: não há prazo pra mostrar
    dataLimite.setHours(23, 59, 59, 999); // pode pagar até o fim do dia da retirada
    return dataLimite.getTime();
}
 
function iniciarPrazoPagamento() {
    if (!bannerPrazo) return;
    const limite = obterPrazoLimite();
    if (limite === null) return;
 
    if (limite <= Date.now()) {
        cancelarPorPrazoExpirado();
        return;
    }
 
    bannerPrazo.style.display = "flex";
 
    function tick() {
        const restanteMs = limite - Date.now();
        if (restanteMs <= 0) {
            clearInterval(prazoInterval);
            cancelarPorPrazoExpirado();
            return;
        }
        const horas = Math.floor(restanteMs / 3600000);
        const min = Math.floor((restanteMs % 3600000) / 60000);
        const texto = horas > 0
            ? `${horas}h ${String(min).padStart(2, "0")}min`
            : `${min} min`;
        document.getElementById("banner-prazo-tempo").textContent = texto;
        bannerPrazo.classList.toggle("banner-urgente", restanteMs < 3 * 60 * 60 * 1000);
    }
 
    tick();
    prazoInterval = setInterval(tick, 30 * 1000);
}
 
function cancelarPorPrazoExpirado() {
    // PONTO DE INTEGRAÇÃO COM O BACK-END:
    // aqui usamos SolicitacoesVizin.cancelar, que já cuida de liberar o
    // objeto e notificar as duas partes, em vez de mudar o status na mão.
    if (solicitacaoId && window.SolicitacoesVizin?.cancelar) {
        window.SolicitacoesVizin.cancelar(Number(solicitacaoId), "sistema");
    }
    mostrarTela("prazoExpirado");
}
 
function limparPrazoPagamento() {
    if (prazoInterval) clearInterval(prazoInterval);
}
 
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
 
// Resolvidos de verdade em resolverDadosDoPedido(), chamada dentro da
// inicialização da página (depois de validarSolicitacao() já ter
// preenchido solicitacaoAtual, se existir). Até lá ficam com o fallback
// baseado nos parâmetros da URL/mock, só pra não quebrar nada que os
// referencie antes da inicialização.
// PONTO DE INTEGRAÇÃO COM O BACK-END:
// A taxa de serviço é a comissão da plataforma sobre o aluguel — 10% do
// preço da diária, um valor FIXO que não muda conforme a quantidade de
// dias alugados (diferente do subtotal, que é dias * preço/dia). Somada
// ao subtotal, compõe o total que o locatário paga. O proprietário
// continua recebendo o subtotal cheio; a comissão é retida pela Vizin.
// Esse cálculo hoje é client-side (mock); o ideal é o back-end devolver
// subtotal/taxa/total prontos na própria solicitação, pra evitar qualquer
// divergência com o valor cobrado de fato.
const TAXA_SERVICO_PERCENTUAL = 0.10;
 
let dias = calcularDias(dataRetirada, dataDevolucao);
let subtotal = dias * produto.preco_dia;
let taxaServico = Math.round(produto.preco_dia * TAXA_SERVICO_PERCENTUAL * 100) / 100;
let total = subtotal + taxaServico;
let tituloProduto = produto.titulo;
let categoriaProduto = produto.categoria;
let imagemProduto = produto.imagem;
let retiradaExibida = dataRetirada;
let devolucaoExibida = dataDevolucao;
 
// Se a solicitação real já foi validada (ver validarSolicitacao), usamos os
// dados dela — são os valores que o proprietário efetivamente aprovou.
// Sem solicitação (acesso de teste sem solicitacaoId), fica no fallback acima.
function resolverDadosDoPedido() {
    if (!solicitacaoAtual) return;
    dias = solicitacaoAtual.dias || dias;
    // solicitacaoAtual.total foi calculado na Página de Produto como
    // dias * preço/dia, ou seja, é o subtotal (sem a taxa de serviço).
    subtotal = solicitacaoAtual.total ?? subtotal;
    // Preço da diária = subtotal / dias (mesmo valor usado no card do
    // produto) — a taxa é 10% fixo sobre ELE, não sobre o subtotal, então
    // não pode ser recalculada em cima de "subtotal * 10%" aqui.
    const precoDia = subtotal / dias;
    taxaServico = Math.round(precoDia * TAXA_SERVICO_PERCENTUAL * 100) / 100;
    total = subtotal + taxaServico;
    tituloProduto = solicitacaoAtual.produtoTitulo || tituloProduto;
    categoriaProduto = solicitacaoAtual.categoriaProduto || categoriaProduto;
    imagemProduto = solicitacaoAtual.imagemProduto || imagemProduto;
    retiradaExibida = solicitacaoAtual.dataRetirada || retiradaExibida;
    devolucaoExibida = solicitacaoAtual.dataDevolucao || devolucaoExibida;
}
 
function preencherResumo() {
    document.getElementById("resumo-imagem").src = imagemProduto;
    document.getElementById("resumo-imagem").alt = tituloProduto;
    document.getElementById("resumo-produto-nome").textContent = tituloProduto;
    document.getElementById("resumo-produto-categoria").textContent = categoriaProduto;
    document.getElementById("resumo-periodo").textContent = `${dias} dia${dias > 1 ? "s" : ""}`;
    document.getElementById("resumo-retirada").textContent = formatarData(retiradaExibida);
    document.getElementById("resumo-devolucao").textContent = formatarData(devolucaoExibida);
    document.getElementById("resumo-preco-dia").textContent = formatarPreco(subtotal / dias);
    document.getElementById("resumo-subtotal").textContent = formatarPreco(subtotal);
    document.getElementById("resumo-taxa-servico").textContent = formatarPreco(taxaServico);
    document.getElementById("resumo-total").textContent = formatarPreco(total);
    document.getElementById("pix-valor").textContent = formatarPreco(total);
    document.getElementById("btn-pagar-cartao").textContent = `Pagar ${formatarPreco(total)}`;
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
// PONTO DE INTEGRAÇÃO COM O BACK-END:
// O prazo real de expiração do PIX vem do gateway de pagamento junto com o
// QR Code/código gerado. A confirmação também deve vir de lá (webhook),
// não de um botão clicado pelo usuário — o botão de "simular" abaixo existe
// só pra testar o fluxo sem um back-end real; pode ser removido na integração.
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
    // Em produção isso seria: GET /api/pagamentos/:id/status em polling
    // (ou, melhor ainda, um WebSocket/SSE), nunca um botão manual do usuário.
    pixPollingTimeout = setTimeout(() => {
        confirmarPagamento("pix");
    }, 9000);
}
 
function pararPollingPix() {
    if (pixPollingTimeout) clearTimeout(pixPollingTimeout);
    pixPollingTimeout = null;
    if (pixAguardando) pixAguardando.style.display = "none";
}
 
document.getElementById("btn-simular-pix")?.addEventListener("click", () => {
    pararPollingPix();
    confirmarPagamento("pix");
});
 
document.getElementById("btn-gerar-novo-pix").addEventListener("click", () => {
    gerarCodigoPix();
    iniciarFluxoPix();
});
 
// ================= TRAVA CONTRA CLIQUE DUPLO / PAGAMENTO EM DOBRO =================
let pagamentoEmProcessamento = false;
 
// ================= MARCA A SOLICITAÇÃO COMO PAGA =================
// PONTO DE INTEGRAÇÃO COM O BACK-END:
// Isso deve acontecer no servidor, disparado pela confirmação real do
// gateway de pagamento (webhook), não no clique do botão no front-end.
// O servidor também deve garantir idempotência (não permitir marcar como
// pago duas vezes a mesma solicitação).
function marcarComoPago() {
    if (solicitacaoId && window.SolicitacoesVizin) {
        window.SolicitacoesVizin.atualizarStatus(Number(solicitacaoId), "pago");
    }
}
 
// ================= REDIRECIONAR PARA A CONFIRMAÇÃO =================
function irParaConfirmacao() {
    limparPrazoPagamento();
    marcarComoPago();
 
    const query = new URLSearchParams({
        produtoId: produto.id,
        retirada: dataRetirada || "",
        devolucao: dataDevolucao || "",
        total: total,
        solicitacaoId: solicitacaoId || ""
    });
    window.location.href = `../Pagamento-confirmado/index.html?${query.toString()}`;
}
 
// ================= FLUXO ÚNICO DE CONFIRMAÇÃO (PIX ou cartão) =================
function confirmarPagamento(metodo) {
    if (pagamentoEmProcessamento) return; // trava contra clique/confirmação duplicada
    pagamentoEmProcessamento = true;
 
    // Checagem de disponibilidade bem no momento de processar o pagamento
    // (e não só ao abrir a página), pra reduzir a janela da race condition.
    if (!objetoAindaDisponivel()) {
        pagamentoEmProcessamento = false;
        pararTimerPix();
        pararPollingPix();
        mostrarTela("objetoIndisponivel");
        return;
    }
 
    irParaConfirmacao();
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
        // Ninguém tem cartão salvo ainda: comportamento de sempre, só o formulário manual.
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
 
    // Pré-seleciona o cartão padrão (ou o primeiro, se nenhum estiver marcado).
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
    // só mostra "usar um cartão salvo" pra voltar se realmente houver algum salvo
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
    if (pagamentoEmProcessamento) return; // trava contra duplo submit
 
    esconderErroCartao();
 
    const usandoCartaoSalvo = Boolean(cartaoSalvoSelecionadoId);
    if (!usandoCartaoSalvo && !validarCampoCartao()) return;
 
    pagamentoEmProcessamento = true;
    btnPagarCartao.disabled = true;
    btnPagarCartao.innerHTML = `<span class="spinner"></span> Processando...`;
 
    try {
        if (!objetoAindaDisponivel()) {
            mostrarTela("objetoIndisponivel");
            return;
        }
 
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
        //         solicitacao_id: solicitacaoId,
        //         retirada: dataRetirada,
        //         devolucao: dataDevolucao,
        //         token_cartao: "[token gerado pelo gateway de pagamento]"
        //     })
        // });
        // if (!response.ok) {
        //     const erro = await response.json();
        //     throw new Error(erro.mensagem || "Pagamento recusado");
        // }
 
        await new Promise(resolve => setTimeout(resolve, 1500)); // simula processamento
 
        // simulação de recusa aleatória, só pra exercitar a tela de erro em teste.
        // Troque a condição abaixo pra "Math.random() < 0.2" pra testar a tela de erro.
        const recusadoNoTeste = false;
        if (recusadoNoTeste) {
            throw new Error("O cartão foi recusado pela operadora. Verifique os dados ou tente outro cartão.");
        }
 
        confirmarPagamento("cartao");
    } catch (err) {
        console.error(err);
        mostrarErroGeralCartao(err.message || "Não foi possível processar o pagamento. Verifique os dados e tente novamente.");
        pagamentoEmProcessamento = false;
        btnPagarCartao.disabled = false;
        btnPagarCartao.textContent = formatarPreco(total);
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
    resolverDadosDoPedido();
    if (!objetoAindaDisponivel()) {
        mostrarTela("objetoIndisponivel");
        return;
    }
    mostrarTela("pagamento");
    preencherResumo();
    iniciarPrazoPagamento();
    renderizarCartoesSalvos();
})();