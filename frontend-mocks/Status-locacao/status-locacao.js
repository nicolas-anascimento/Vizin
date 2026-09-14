// ================= PROTEGER PÁGINA =================
if (!localStorage.getItem("token")) {
    window.location.href = "../Login/index.html";
}

const usuarioLogado = JSON.parse(localStorage.getItem("usuario") || "null");

// ================= LER SOLICITAÇÃO =================
const params = new URLSearchParams(window.location.search);
const solicitacaoId = params.get("solicitacaoId");

// PONTO DE INTEGRAÇÃO COM O BACK-END:
// GET /api/pedidos/:solicitacaoId — deve trazer objeto, as duas partes,
// datas e o status atual do ciclo de vida do aluguel.
const solicitacao = (solicitacaoId && window.SolicitacoesVizin)
    ? window.SolicitacoesVizin.obterPorId(Number(solicitacaoId))
    : null;

if (!solicitacao) {
    // Sem uma solicitação válida não há o que mostrar nesta tela.
    document.querySelector(".status-container").innerHTML =
        `<p style="text-align:center; padding: 60px 20px; color: var(--texto-suave);">
            Não foi possível encontrar esta locação.
        </p>`;
    throw new Error("Solicitação não encontrada");
}

// ================= [SÓ PARA TESTES] TOGGLE DE PAPEL =================
// TODO: remover este bloco quando integrar com o back-end real. Ele existe
// só pra permitir pré-visualizar esta tela como locatário OU proprietário
// numa sessão só, já que normalmente o papel é decidido comparando o e-mail
// logado com o e-mail do proprietário da solicitação.
const CHAVE_SIM_PAPEL = "vizin_sim_papel_override";

function papelReal() {
    return (usuarioLogado?.email === solicitacao.proprietarioEmail) ? "proprietario" : "locatario";
}

function papelSimulado() {
    return sessionStorage.getItem(CHAVE_SIM_PAPEL);
}

const meuPapel = papelSimulado() || papelReal();

const togglePapelEls = document.querySelectorAll(".sim-papel-btn");
togglePapelEls.forEach(btn => {
    btn.classList.toggle("ativo", btn.dataset.papel === meuPapel);
    btn.addEventListener("click", () => {
        sessionStorage.setItem(CHAVE_SIM_PAPEL, btn.dataset.papel);
        location.reload();
    });
});

function formatarData(dataStr) {
    if (!dataStr) return "-";
    const [ano, mes, dia] = dataStr.split("-");
    return `${dia}/${mes}/${ano}`;
}

// ================= PREENCHER CABEÇALHO / PRODUTO =================
document.getElementById("produto-mini-imagem").src = solicitacao.imagemProduto || "../img/sem-imagem.jpg";
document.getElementById("produto-mini-nome").textContent = solicitacao.produtoTitulo;
document.getElementById("produto-mini-categoria").textContent = solicitacao.categoriaProduto || "Ferramentas";
document.getElementById("detalhe-retirada").textContent = formatarData(solicitacao.dataRetirada);
document.getElementById("detalhe-devolucao").textContent = formatarData(solicitacao.dataDevolucao);
document.getElementById("detalhe-proprietario").textContent = solicitacao.proprietarioNome || "Proprietário";
document.getElementById("detalhe-locatario").textContent = solicitacao.solicitanteNome || "Locatário";

// ================= MAPA DE STATUS -> ETAPA DO STEPPER =================
// Índice do step considerado "atual" para cada status da solicitação.
// pago = ainda não retirou (nenhum step concluído ainda)
// retirado = passo 0 concluído, está na posse do locatário (passo 1 atual)
// aguardando_devolucao = passos 0 e 1 concluídos, devolução em andamento (passo 2 atual)
// concluido = tudo concluído (passo 3)
const ETAPAS = [
    { chave: "retirado", label: "Pedido Retirado", icone: "bi-check" },
    { chave: "em_posse", label: "Em posse do Locatário", icone: "bi-box-seam" },
    { chave: "aguardando_devolucao", label: "Aguardando Devolução", icone: "bi-arrow-counterclockwise" },
    { chave: "concluido", label: "Pedido Concluído", icone: "bi-check2-circle" }
];

function indiceAtual(status) {
    if (status === "pago") return -1;                 // nenhum passo concluído ainda
    if (status === "retirado") return 1;               // passo 0 feito, passo 1 é o atual
    if (status === "aguardando_devolucao") return 2;    // passos 0-1 feitos, passo 2 é o atual
    if (status === "concluido") return 3;               // tudo feito
    return -1;
}

const STATUS_GERAL_LABEL = {
    pendente: "Pendente",
    aprovado: "Aguardando pagamento",
    pago: "Aguardando retirada",
    retirado: "Em andamento",
    aguardando_devolucao: "Em andamento",
    concluido: "Concluído"
};

const STATUS_GERAL_CLASSE = {
    pendente: "aguardando-pagamento",
    aprovado: "aguardando-pagamento",
    pago: "aguardando-retirada",
    retirado: "andamento",
    aguardando_devolucao: "aguardando-devolucao",
    concluido: "concluido"
};

const badgeGeral = document.getElementById("badge-status-geral");
badgeGeral.textContent = STATUS_GERAL_LABEL[solicitacao.status] || solicitacao.status;
badgeGeral.className = `status-pill ${STATUS_GERAL_CLASSE[solicitacao.status] || ""}`;

const badgeAtual = document.getElementById("badge-status-atual");
badgeAtual.textContent = STATUS_GERAL_LABEL[solicitacao.status] || solicitacao.status;
badgeAtual.className = `status-pill ${STATUS_GERAL_CLASSE[solicitacao.status] || ""}`;

// ================= RENDER DO STEPPER =================
const idxAtual = indiceAtual(solicitacao.status);
const stepperEl = document.getElementById("stepper");
stepperEl.innerHTML = "";

ETAPAS.forEach((etapa, i) => {
    const feito = idxAtual > i || solicitacao.status === "concluido" && i <= 3 && idxAtual >= i;
    const concluidoDeVerdade = i < idxAtual || (solicitacao.status === "concluido");
    const ehAtual = i === idxAtual && solicitacao.status !== "concluido";

    const div = document.createElement("div");
    div.className = `step ${concluidoDeVerdade ? "feito" : ""} ${ehAtual ? "atual" : ""}`;
    div.innerHTML = `
        <div class="step-linha"></div>
        <div class="step-circulo"><i class="bi ${concluidoDeVerdade ? "bi-check" : etapa.icone}"></i></div>
        <span class="step-label">${etapa.label}</span>
        ${(concluidoDeVerdade && i === 0) ? `<span class="step-data">${formatarData(solicitacao.dataRetirada)}</span>` : ""}
    `;
    stepperEl.appendChild(div);
});

// ================= TEXTO DA ETAPA ATUAL =================
const ETAPA_TEXTO = {
    pago: {
        titulo: "Etapa atual: Aguardando retirada",
        texto: "Assim que ambas as partes registrarem as fotos da retirada, o objeto passa para a posse do locatário."
    },
    retirado: {
        titulo: "Etapa atual: Em posse do Locatário",
        texto: "O objeto está sendo utilizado pelo locatário até a data prevista para devolução."
    },
    aguardando_devolucao: {
        titulo: "Etapa atual: Aguardando Devolução",
        texto: "A devolução foi iniciada. Assim que ambas as partes registrarem as fotos, a locação será concluída."
    },
    concluido: {
        titulo: "Locação concluída",
        texto: "O objeto foi devolvido e a locação foi encerrada com sucesso. Já é possível avaliar a transação."
    }
};

const infoAtual = ETAPA_TEXTO[solicitacao.status] || ETAPA_TEXTO.pago;
document.getElementById("etapa-atual-titulo").textContent = infoAtual.titulo;
document.getElementById("etapa-atual-texto").textContent = infoAtual.texto;

// ================= CTAs CONDICIONAIS =================
const ctaDevolucao = document.getElementById("cta-devolucao");
const avisoAguardandoProprietario = document.getElementById("aviso-aguardando-proprietario");
const ctaContinuarDevolucao = document.getElementById("cta-continuar-devolucao");

if (solicitacao.status === "retirado") {
    if (meuPapel === "locatario") {
        ctaDevolucao.style.display = "flex";
    } else {
        avisoAguardandoProprietario.style.display = "block";
    }
} else if (solicitacao.status === "aguardando_devolucao") {
    // PONTO DE INTEGRAÇÃO COM O BACK-END:
    // Verificar via GET /api/devolucoes/:aluguelId/status se a PRÓPRIA
    // pessoa já enviou as fotos dela; aqui simplificamos e sempre oferecemos
    // o atalho para continuar a devolução.
    ctaContinuarDevolucao.style.display = "flex";
}

document.getElementById("btn-iniciar-devolucao").addEventListener("click", () => {
    // PONTO DE INTEGRAÇÃO COM O BACK-END: PATCH /api/solicitacoes/:id { status: "aguardando_devolucao" }
    window.SolicitacoesVizin.atualizarStatus(solicitacao.id, "aguardando_devolucao");

    if (window.NotificacoesVizin) {
        window.NotificacoesVizin.adicionarNotificacao({
            tipo: "devolucao_confirmada",
            titulo: "Devolução iniciada",
            descricao: `${solicitacao.solicitanteNome || "O locatário"} iniciou a devolução de "${solicitacao.produtoTitulo}".`,
            data: new Date().toLocaleDateString("pt-BR"),
            solicitacaoId: solicitacao.id
        }, solicitacao.proprietarioEmail);
    }

    const query = new URLSearchParams({ produtoId: solicitacao.produtoId, solicitacaoId: solicitacao.id });
    window.location.href = `../Devolucao-objeto/index.html?${query.toString()}`;
});

document.getElementById("btn-continuar-devolucao").addEventListener("click", () => {
    const query = new URLSearchParams({ produtoId: solicitacao.produtoId, solicitacaoId: solicitacao.id });
    window.location.href = `../Devolucao-objeto/index.html?${query.toString()}`;
});

// ================= AÇÕES FINAIS =================
document.getElementById("btn-contato").addEventListener("click", () => {
    const outraParteEmail = meuPapel === "locatario" ? solicitacao.proprietarioEmail : solicitacao.solicitanteEmail;
    const outraParteNome = meuPapel === "locatario" ? solicitacao.proprietarioNome : solicitacao.solicitanteNome;

    const query = new URLSearchParams({
        userId: outraParteEmail,
        userName: outraParteNome || "",
        produtoId: solicitacao.produtoId,
        produtoTitulo: solicitacao.produtoTitulo
    });
    window.location.href = `../Mensagens/index.html?${query.toString()}`;
});

document.getElementById("btn-ver-detalhes").addEventListener("click", () => {
    // PONTO DE INTEGRAÇÃO COM O BACK-END:
    // Deve abrir um recibo/comprovante completo (valores, taxas, método de
    // pagamento etc.) — ainda não existe essa tela neste recorte do projeto.
    mostrarToast("Em breve: comprovante completo da locação");
});

function mostrarToast(mensagem) {
    const toast = document.getElementById("toast");
    if (!toast) return;
    toast.innerText = mensagem;
    toast.className = "toast show sucesso";
    setTimeout(() => toast.classList.remove("show"), 2500);
}