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
    // Antes disto a pessoa caía numa página morta (só um parágrafo, sem
    // nenhum link de saída). Agora segue o mesmo padrão de Retirada/Devolução.
    document.querySelector(".status-container").innerHTML = `
        <div class="card status-card">
            <div class="status-icone status-erro"><i class="bi bi-exclamation-triangle"></i></div>
            <h2 class="status-titulo">Não encontramos essa locação</h2>
            <p class="status-texto">O link que você acessou pode estar incorreto ou a solicitação já não existe mais.</p>
            <a class="btn btn-primary btn-block" href="../Historico/index.html" style="margin-top:14px;">Ver meu Histórico</a>
        </div>
    `;
    throw new Error("Solicitação não encontrada");
}

// ================= REAGIR A CANCELAMENTO AUTOMÁTICO =================
// solicitacoes-shared.js cancela sozinho locações "pago" cujo prazo de
// retirada expirou (verificação periódica). Se isso acontecer enquanto esta
// tela está aberta, a pessoa não deveria continuar vendo um stepper "em
// andamento" desatualizado até dar F5 por conta própria.
document.addEventListener("solicitacoesAtualizadas", () => {
    if (!window.SolicitacoesVizin) return;
    const atual = window.SolicitacoesVizin.obterPorId(solicitacao.id);
    if (atual && atual.status === "cancelado" && solicitacao.status !== "cancelado") {
        alert("Esta locação foi cancelada automaticamente porque o prazo da retirada expirou. O valor pago foi estornado.");
        location.reload();
    }
});

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

// ================= ACESSO NEGADO =================
// Faltava aqui a mesma checagem que já existe em Retirada e Devolução: sem
// ela, qualquer pessoa logada que abrisse o link de status de OUTRA pessoa
// caía no default "locatario" de papelReal() e via os CTAs de ação como se
// fizesse parte da locação.
const souParteDaLocacao = usuarioLogado?.email === solicitacao.solicitanteEmail
    || usuarioLogado?.email === solicitacao.proprietarioEmail;

if (!papelSimulado() && !souParteDaLocacao) {
    document.getElementById("conteudo-status").style.display = "none";
    document.getElementById("sim-papel-toggle").style.display = "none";
    document.getElementById("etapa-acesso-negado").style.display = "block";
}

function formatarData(dataStr) {
    if (!dataStr) return "-";
    const [ano, mes, dia] = dataStr.split("-");
    return `${dia}/${mes}/${ano}`;
}

function parseDataISOLocal(dataStr) {
    if (!dataStr) return null;
    const partes = dataStr.split("-").map(Number);
    if (partes.length !== 3 || partes.some(Number.isNaN)) return null;
    const [ano, mes, dia] = partes;
    return new Date(ano, mes - 1, dia);
}

// Mesma função de historico.js — formata um timestamp ISO (ex: o
// "multaCongeladaEm"/"multaPagaEm" salvo pelo SolicitacoesVizin) pra
// "dd/mm/aaaa às HH:MM", usado no comprovante de multa abaixo.
function formatarDataHora(isoStr) {
    if (!isoStr) return "-";
    const d = new Date(isoStr);
    const dia = String(d.getDate()).padStart(2, "0");
    const mes = String(d.getMonth() + 1).padStart(2, "0");
    const ano = d.getFullYear();
    const hora = String(d.getHours()).padStart(2, "0");
    const min = String(d.getMinutes()).padStart(2, "0");
    return `${dia}/${mes}/${ano} às ${hora}:${min}`;
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

// Antes esses textos e classes eram só desta tela e não batiam com os do
// Histórico (ver STATUS_LABEL / STATUS_PILL_CLASSE em historico.js) — a
// mesma locação podia aparecer com um rótulo/cor num lugar e outro rótulo/
// cor no outro. Agora usam exatamente o mesmo agrupamento do Histórico.
const STATUS_GERAL_LABEL = {
    pendente: "Aguardando aprovação",
    aprovado: "Aguardando pagamento",
    pago: "Aguardando retirada",
    retirado: "Em andamento",
    aguardando_devolucao: "Em andamento",
    concluido: "Concluído",
    rejeitado: "Recusado",
    cancelado: "Cancelado"
};

const STATUS_GERAL_CLASSE = {
    pendente: "pendente",
    aprovado: "pendente",
    pago: "confirmado",
    retirado: "confirmado",
    aguardando_devolucao: "confirmado",
    concluido: "concluido",
    rejeitado: "recusado",
    cancelado: "recusado"
};

// ================= ATRASO NA DEVOLUÇÃO (mesmo cálculo do Histórico) =================
// O prazo-card já avisava sobre o atraso no texto, mas o badge principal
// (aqui em cima e no card de detalhes) continuava mostrando "Em andamento"
// verde mesmo com a devolução atrasada — diferente do Histórico, que troca
// o pill inteiro pra "Devolução atrasada" em vermelho. Ver
// estaComDevolucaoAtrasada em historico.js.
function estaComDevolucaoAtrasada(s) {
    if (s.status !== "retirado" && s.status !== "aguardando_devolucao") return false;
    const dataDevolucao = parseDataISOLocal(s.dataDevolucao);
    if (!dataDevolucao) return false;
    const hoje = new Date();
    hoje.setHours(0, 0, 0, 0);
    return dataDevolucao < hoje;
}

const atrasado = estaComDevolucaoAtrasada(solicitacao);
const labelStatusGeral = atrasado ? "Devolução atrasada" : (STATUS_GERAL_LABEL[solicitacao.status] || solicitacao.status);
const classeStatusGeral = atrasado ? "atrasado" : (STATUS_GERAL_CLASSE[solicitacao.status] || "");

const badgeGeral = document.getElementById("badge-status-geral");
badgeGeral.textContent = labelStatusGeral;
badgeGeral.className = `status-pill ${classeStatusGeral}`;

const badgeAtual = document.getElementById("badge-status-atual");
badgeAtual.textContent = labelStatusGeral;
badgeAtual.className = `status-pill ${classeStatusGeral}`;

// ================= ESTADO: LOCAÇÃO CANCELADA =================
// Antes, uma locação cancelada caía no fallback do stepper (tudo zerado,
// como se nada tivesse começado) e no texto padrão "Aguardando retirada" —
// dando a entender que a locação ainda estava rolando normalmente. Agora
// mostra um estado dedicado no lugar do stepper/detalhes/CTAs, que não se
// aplicam mais a uma locação cancelada.
const detalhesStatusEl = document.getElementById("detalhes-status");
const etapaCanceladaEl = document.getElementById("etapa-cancelada");

if (solicitacao.status === "cancelado") {
    if (detalhesStatusEl) detalhesStatusEl.style.display = "none";
    if (etapaCanceladaEl) etapaCanceladaEl.style.display = "block";
} else {

    // ================= AVISO DE PRAZO / ATRASO =================
    // As telas de Retirada e Devolução já avisam sobre prazo; esta tela
    // "hub" — onde a pessoa mais provavelmente confere o andamento — não
    // tinha nada disso.
    (function mostrarPrazo() {
        const prazoCard = document.getElementById("prazo-card");
        const prazoTexto = document.getElementById("prazo-texto");
        if (!prazoCard || !prazoTexto) return;

        const hoje = new Date();
        hoje.setHours(0, 0, 0, 0);

        if (solicitacao.status === "pago") {
            const dataRetirada = parseDataISOLocal(solicitacao.dataRetirada);
            if (!dataRetirada) return;
            const diffDias = Math.round((dataRetirada - hoje) / 86400000);
            const dataFormatada = formatarData(solicitacao.dataRetirada);
            let texto;

            if (diffDias > 1) {
                texto = `Faltam ${diffDias} dias para a retirada (${dataFormatada}). Se o prazo passar sem que ambas as partes confirmem, a locação é cancelada automaticamente e o valor é estornado.`;
            } else if (diffDias === 1) {
                texto = `A retirada precisa ser confirmada até amanhã (${dataFormatada}).`;
                prazoCard.classList.add("prazo-urgente");
            } else if (diffDias === 0) {
                texto = "A retirada precisa ser confirmada hoje.";
                prazoCard.classList.add("prazo-urgente");
            } else {
                texto = "O prazo da retirada já passou — atualize a página para ver se a locação foi cancelada automaticamente.";
                prazoCard.classList.add("prazo-urgente");
            }

            prazoTexto.textContent = texto;
            prazoCard.style.display = "flex";
            return;
        }

        if (solicitacao.status === "retirado" || solicitacao.status === "aguardando_devolucao") {
            const dataDevolucao = parseDataISOLocal(solicitacao.dataDevolucao);
            if (!dataDevolucao) return;
            const diffDias = Math.round((dataDevolucao - hoje) / 86400000);
            const dataFormatada = formatarData(solicitacao.dataDevolucao);
            let texto;

            if (diffDias > 1) {
                texto = `Faltam ${diffDias} dias para o prazo da devolução (${dataFormatada}).`;
            } else if (diffDias === 1) {
                texto = `A devolução precisa ser confirmada até amanhã (${dataFormatada}).`;
                prazoCard.classList.add("prazo-urgente");
            } else if (diffDias === 0) {
                texto = "A devolução precisa ser confirmada hoje.";
                prazoCard.classList.add("prazo-urgente");
            } else {
                // PONTO DE INTEGRAÇÃO COM O BACK-END:
                // calcularMulta hoje é uma estimativa local (mesma regra usada
                // na Devolução); o valor "oficial" deve vir do back-end.
                const multa = window.SolicitacoesVizin?.calcularMulta
                    ? window.SolicitacoesVizin.calcularMulta(solicitacao)
                    : { diasAtraso: Math.abs(diffDias), valorTotal: null };
                const valorFormatado = (window.SolicitacoesVizin?.formatarReal && multa.valorTotal != null)
                    ? window.SolicitacoesVizin.formatarReal(multa.valorTotal)
                    : null;
                const parteMulta = valorFormatado ? ` Já soma ${valorFormatado} de multa por atraso.` : "";
                texto = `Devolução em atraso há ${multa.diasAtraso} dia(s) — o prazo era ${dataFormatada}.${parteMulta}`;
                prazoCard.classList.add("prazo-urgente");
            }

            prazoTexto.textContent = texto;
            prazoCard.style.display = "flex";
        }
    })();

    // ================= MULTA POR ATRASO NA DEVOLUÇÃO =================
    // O mesmo comprovante que já existe no Histórico (ver
    // montarComprovanteMulta em historico.js), incluindo o botão Pagar
    // Multa — antes, quem estava aqui no Status precisava voltar pro
    // Histórico pra resolver a multa, mesmo essa tela já mostrando o valor
    // estimado no texto do prazo.
    renderizarMulta();

    // ================= RENDER DO STEPPER =================
    const idxAtual = indiceAtual(solicitacao.status);
    const stepperEl = document.getElementById("stepper");
    stepperEl.innerHTML = "";

    ETAPAS.forEach((etapa, i) => {
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

    // Antes caía sempre no texto de "pago" pra qualquer status não mapeado
    // (ex: pendente, aprovado), dando informação errada. Agora, se não há um
    // texto específico, mostra algo honesto em vez de inventar uma etapa.
    const infoAtual = ETAPA_TEXTO[solicitacao.status] || {
        titulo: `Status: ${STATUS_GERAL_LABEL[solicitacao.status] || solicitacao.status}`,
        texto: "Acompanhe aqui o andamento da sua locação."
    };
    document.getElementById("etapa-atual-titulo").textContent = infoAtual.titulo;
    document.getElementById("etapa-atual-texto").textContent = infoAtual.texto;

    // ================= CTA: INICIAR / CONTINUAR RETIRADA =================
    // Antes não existia NENHUM caminho, a partir desta tela, até a página de
    // Retirada — a pessoa só chegava lá se soubesse a URL de cor. Aparece
    // pras duas partes assim que o pagamento é confirmado, já que as duas
    // precisam enviar fotos pra retirada ser concluída.
    const ctaRetirada = document.getElementById("cta-retirada");
    const ctaRetiradaTexto = document.getElementById("cta-retirada-texto");
    const btnIrRetirada = document.getElementById("btn-ir-retirada");

    if (solicitacao.status === "pago" && ctaRetirada) {
        // PONTO DE INTEGRAÇÃO COM O BACK-END:
        // Verificar via GET /api/retiradas/:aluguelId/status se a PRÓPRIA
        // pessoa já enviou as fotos dela; aqui usamos o mesmo módulo mock
        // que a página de Retirada usa (RetiradaVizin).
        const statusRetirada = window.RetiradaVizin ? window.RetiradaVizin.obterStatus(solicitacao.id) : null;
        const jaEnviei = !!(statusRetirada && statusRetirada[meuPapel] && statusRetirada[meuPapel].enviado);

        ctaRetiradaTexto.textContent = jaEnviei
            ? "Você já enviou suas fotos da retirada. Assim que a outra parte enviar as dela, a locação avança automaticamente."
            : "Registre fotos do objeto no momento da retirada para confirmar que ele foi entregue nas condições combinadas.";

        btnIrRetirada.innerHTML = jaEnviei
            ? `<i class="bi bi-camera"></i> Ver Retirada`
            : `<i class="bi bi-camera"></i> Iniciar Retirada`;

        ctaRetirada.style.display = "flex";

        btnIrRetirada.addEventListener("click", () => {
            const query = new URLSearchParams({ produtoId: solicitacao.produtoId, solicitacaoId: solicitacao.id });
            window.location.href = `../Retirada-objeto/index.html?${query.toString()}`;
        });
    }

    // ================= CTAs CONDICIONAIS (DEVOLUÇÃO) =================
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

// ================= AVALIAR LOCAÇÃO =================
// Substitui o antigo "Ver detalhes" (que só mostrava um toast de "em breve" —
// não existia comprovante de verdade). Só faz sentido oferecer avaliação
// depois que a locação foi CONCLUÍDA; antes disso o botão fica escondido.
// Se a pessoa já avaliou, o botão avisa isso em vez de repetir "Avaliar"
// como se nada tivesse sido enviado ainda.
const btnAvaliar = document.getElementById("btn-avaliar");
if (btnAvaliar && solicitacao.status === "concluido") {
    const jaAvaliei = window.AvaliacoesVizin
        ? window.AvaliacoesVizin.jaAvaliou(solicitacao.id, meuPapel)
        : false;

    btnAvaliar.style.display = "";
    btnAvaliar.innerHTML = jaAvaliei
        ? `<i class="bi bi-star-fill"></i> Ver minha avaliação`
        : `<i class="bi bi-star"></i> Avaliar Locação`;

    btnAvaliar.addEventListener("click", () => {
        window.location.href = `../Avaliacao/index.html?solicitacaoId=${solicitacao.id}`;
    });
}

function mostrarToast(mensagem) {
    const toast = document.getElementById("toast");
    if (!toast) return;
    toast.innerText = mensagem;
    toast.className = "toast show sucesso";
    setTimeout(() => toast.classList.remove("show"), 2500);
}

// ================= COMPROVANTE + AÇÕES DA MULTA =================
// Réplica do comprovante do Histórico (montarComprovanteMulta em
// historico.js), adaptada pro papel já calculado aqui ("locatario"/
// "proprietario" em vez de "alugado"/"alugado-para-outros") e pra um único
// `solicitacao` em vez de uma lista de itens do histórico.
function montarComprovanteMulta() {
    if (!solicitacao.multaAtraso || solicitacao.multaAtraso.diasAtraso <= 0 || !window.SolicitacoesVizin) return "";

    const formatar = window.SolicitacoesVizin.formatarReal;
    const status = solicitacao.multaStatus || "pendente";
    const souLocatario = meuPapel === "locatario";

    const STATUS_INFO = {
        pendente: { label: "Pendente", cor: "#dc2626", fundo: "#fdeaea" },
        paga: { label: "Paga", cor: "#1f8b4c", fundo: "#e6f6ec" }
    };
    const infoStatus = STATUS_INFO[status] || STATUS_INFO.pendente;

    const quando = status === "paga" && solicitacao.multaPagaEm
        ? `Paga em ${formatarDataHora(solicitacao.multaPagaEm)}`
        : `Congelada em ${formatarDataHora(solicitacao.multaCongeladaEm)}`;

    const valorParaMim = souLocatario ? solicitacao.multaAtraso.valorTotal : solicitacao.multaAtraso.valorProprietario;
    const rotuloValor = souLocatario ? "Valor cobrado" : "Seu valor (após taxa da plataforma)";

    // Pagar Multa não paga na hora mais — leva pra página de pagamento
    // dedicada (Pagamento-multa), igual ao checkout normal do aluguel.
    const acoes = (souLocatario && status === "pendente")
        ? `<div style="display:flex; gap:10px; margin-top:10px;">
                <a class="btn btn-primary" href="../Pagamento-multa/index.html?solicitacaoId=${solicitacao.id}">
                    <i class="bi bi-credit-card"></i> Pagar Multa
                </a>
           </div>`
        : "";

    return `
        <div class="card card-aluguel-multa" style="background:${infoStatus.fundo};">
            <div style="display:flex; align-items:center; justify-content:space-between; gap:10px;">
                <span style="font-size:13px; font-weight:700; color:var(--texto);">
                    <i class="bi bi-receipt"></i> Multa por atraso na devolução
                </span>
                <span style="font-size:11px; font-weight:700; padding:3px 10px; border-radius:999px; background:${infoStatus.cor}; color:#fff;">
                    ${infoStatus.label}
                </span>
            </div>
            <div style="font-size:12.5px; color:var(--texto-suave); margin-top:8px; display:flex; flex-direction:column; gap:3px;">
                <span>${solicitacao.multaAtraso.diasAtraso} dia(s) de atraso · ${formatar(window.SolicitacoesVizin.MULTA_POR_DIA_ATRASO)}/dia</span>
                <span>${rotuloValor}: <strong style="color:var(--texto);">${formatar(valorParaMim)}</strong></span>
                <span>${quando}</span>
            </div>
            ${acoes}
        </div>
    `;
}

function renderizarMulta() {
    const container = document.getElementById("multa-card-container");
    if (!container) return;
    container.innerHTML = montarComprovanteMulta();
}