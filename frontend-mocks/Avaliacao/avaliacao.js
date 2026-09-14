// ================= PROTEGER PÁGINA =================
if (!localStorage.getItem("token")) {
    window.location.href = "../Login/index.html";
}

const usuarioLogado = JSON.parse(localStorage.getItem("usuario") || "null");

// ================= LER SOLICITAÇÃO =================
const params = new URLSearchParams(window.location.search);
const solicitacaoId = params.get("solicitacaoId");

// PONTO DE INTEGRAÇÃO COM O BACK-END:
// GET /api/pedidos/:solicitacaoId — precisa que o aluguel já esteja
// concluído para permitir a avaliação.
const solicitacao = (solicitacaoId && window.SolicitacoesVizin)
    ? window.SolicitacoesVizin.obterPorId(Number(solicitacaoId))
    : null;

if (!solicitacao) {
    document.querySelector(".avaliacao-container").innerHTML =
        `<p style="text-align:center; padding: 60px 20px; color: var(--texto-suave);">
            Não foi possível encontrar esta locação.
        </p>`;
    throw new Error("Solicitação não encontrada");
}

const aluguelId = solicitacao.id;
// ================= [SÓ PARA TESTES] TOGGLE DE PAPEL =================
// TODO: remover quando integrar com o back-end real. Lê o mesmo override
// usado em Status-locacao / Retirada-objeto / Devolucao-objeto, pra manter
// o papel simulado consistente ao navegar entre as telas do fluxo.
const CHAVE_SIM_PAPEL = "vizin_sim_papel_override";

function papelReal() {
    return (usuarioLogado?.email === solicitacao.proprietarioEmail) ? "proprietario" : "locatario";
}

const meuPapel = sessionStorage.getItem(CHAVE_SIM_PAPEL) || papelReal();
const papelDaOutraParte = meuPapel === "locatario" ? "proprietario" : "locatario";

const nomeOutraParte = meuPapel === "locatario"
    ? (solicitacao.proprietarioNome || "Proprietário")
    : (solicitacao.solicitanteNome || "Locatário");

const emailOutraParte = meuPapel === "locatario"
    ? solicitacao.proprietarioEmail
    : solicitacao.solicitanteEmail;

document.getElementById("link-voltar").addEventListener("click", (e) => {
    e.preventDefault();
    window.location.href = `../Historico/index.html`;
});
document.getElementById("btn-cancelar").addEventListener("click", () => {
    window.location.href = `../Historico/index.html`;
});
document.getElementById("btn-voltar-historico").href = "../Historico/index.html";

// ================= TEXTOS CONFORME QUEM ESTÁ AVALIANDO =================
// O locatário avalia a experiência com o OBJETO (e o proprietário); o
// proprietário avalia o LOCATÁRIO (se foi um bom cliente: cuidado com o
// objeto, pontualidade na devolução, comunicação etc.). Os dados já eram
// separados corretamente em avaliacoes-shared.js (a nota do locatário conta
// como avaliação do produto; a do proprietário conta como avaliação do
// locatário) — só faltava a tela deixar isso claro pra quem está avaliando.
const TEXTOS_AVALIACAO = {
    locatario: {
        titulo: "Avaliar Objeto Alugado",
        subtitulo: "Sua opinião ajuda a comunidade a crescer",
        perguntaEstrelas: `Como foi sua experiência com "${solicitacao.produtoTitulo}"?`,
        perguntaComentario: "Conte como foi a experiência: o estado do objeto, a pontualidade e atenção do proprietário, etc.",
        placeholder: "Ex: Objeto em ótimo estado, proprietário muito atencioso e pontual. Recomendo!"
    },
    proprietario: {
        titulo: "Avaliar Locatário",
        subtitulo: "Diga como foi alugar seu objeto para essa pessoa",
        perguntaEstrelas: `${nomeOutraParte} foi um bom cliente?`,
        perguntaComentario: "Conte como foi lidar com o locatário: cuidado com o objeto, pontualidade na devolução, comunicação, etc.",
        placeholder: "Ex: Locatário pontual, cuidou muito bem do objeto e teve ótima comunicação. Recomendo!"
    }
};

const textosAvaliacao = TEXTOS_AVALIACAO[meuPapel];
document.getElementById("avaliacao-titulo").textContent = textosAvaliacao.titulo;
document.getElementById("avaliacao-subtitulo").textContent = textosAvaliacao.subtitulo;
document.getElementById("pergunta-estrelas").textContent = textosAvaliacao.perguntaEstrelas;
document.getElementById("pergunta-comentario").textContent = textosAvaliacao.perguntaComentario;
document.getElementById("comentario").placeholder = textosAvaliacao.placeholder;

// ================= PREENCHER CABEÇALHO =================
document.getElementById("produto-mini-imagem").src = solicitacao.imagemProduto || "../img/sem-imagem.jpg";
document.getElementById("produto-mini-nome").textContent = solicitacao.produtoTitulo;
document.getElementById("produto-mini-outraparte").innerHTML = meuPapel === "locatario"
    ? `Proprietário: <strong>${nomeOutraParte}</strong>`
    : `Você está avaliando: <strong>${nomeOutraParte}</strong> (locatário)`;

const togglePapelEls = document.querySelectorAll(".sim-papel-btn");
togglePapelEls.forEach(btn => {
    btn.classList.toggle("ativo", btn.dataset.papel === meuPapel);
    btn.addEventListener("click", () => {
        sessionStorage.setItem(CHAVE_SIM_PAPEL, btn.dataset.papel);
        location.reload();
    });
});

// ================= JÁ AVALIOU? =================
if (AvaliacoesVizin.jaAvaliou(aluguelId, meuPapel)) {
    document.querySelectorAll(".card:not(#etapa-enviada)").forEach(el => el.style.display = "none");
    document.querySelector(".avaliacao-actions").style.display = "none";
    document.querySelector(".avaliacao-rodape").style.display = "none";
    document.getElementById("etapa-enviada").style.display = "block";
    // interrompe o resto do script — nada mais a fazer nesta página
    throw new Error("Avaliação já enviada para este aluguel");
}

// ================= ESTRELAS =================
const LEGENDAS = {
    0: "Clique nas estrelas para avaliar",
    1: "Muito ruim",
    2: "Ruim",
    3: "Regular",
    4: "Bom",
    5: "Excelente"
};

let notaSelecionada = 0;
const estrelas = Array.from(document.querySelectorAll(".estrela"));
const legendaEl = document.getElementById("estrelas-legenda");
const escalaFill = document.getElementById("escala-fill");
const btnEnviar = document.getElementById("btn-enviar");

function pintarEstrelas(valor) {
    estrelas.forEach(estrela => {
        estrela.classList.toggle("preenchida", Number(estrela.dataset.valor) <= valor);
    });
}

estrelas.forEach(estrela => {
    estrela.addEventListener("mouseenter", () => pintarEstrelas(Number(estrela.dataset.valor)));
    estrela.addEventListener("mouseleave", () => pintarEstrelas(notaSelecionada));
    estrela.addEventListener("click", () => {
        notaSelecionada = Number(estrela.dataset.valor);
        pintarEstrelas(notaSelecionada);
        legendaEl.textContent = LEGENDAS[notaSelecionada];
        escalaFill.style.width = `${notaSelecionada * 20}%`;
        btnEnviar.disabled = notaSelecionada === 0;
    });
});

// ================= COMENTÁRIO =================
const comentarioEl = document.getElementById("comentario");
const contadorEl = document.getElementById("contador");

comentarioEl.addEventListener("input", () => {
    contadorEl.textContent = comentarioEl.value.length;
});

// ================= ENVIAR AVALIAÇÃO =================
btnEnviar.addEventListener("click", async () => {
    if (notaSelecionada === 0) return;

    btnEnviar.disabled = true;
    btnEnviar.innerHTML = `<span class="spinner"></span> Enviando...`;

    const comentario = comentarioEl.value.trim();

    try {
        // PONTO DE INTEGRAÇÃO COM O BACK-END:
        // POST /api/alugueis/:id/avaliacao { nota, comentario }
        await new Promise(resolve => setTimeout(resolve, 800)); // simula envio

        AvaliacoesVizin.avaliar(aluguelId, meuPapel, notaSelecionada, comentario);

        if (window.NotificacoesVizin && emailOutraParte) {
            const descricaoNotificacao = meuPapel === "locatario"
                ? `Você recebeu uma avaliação de ${notaSelecionada} estrela${notaSelecionada > 1 ? "s" : ""} para "${solicitacao.produtoTitulo}".`
                : `Você recebeu uma avaliação de ${notaSelecionada} estrela${notaSelecionada > 1 ? "s" : ""} como locatário no aluguel de "${solicitacao.produtoTitulo}".`;

            window.NotificacoesVizin.adicionarNotificacao({
                tipo: "avaliacao_recebida",
                titulo: "Nova Avaliação",
                descricao: descricaoNotificacao,
                data: new Date().toLocaleDateString("pt-BR"),
                solicitacaoId: aluguelId
            }, emailOutraParte);
        }

        document.querySelectorAll(".card:not(#etapa-enviada)").forEach(el => el.style.display = "none");
        document.querySelector(".avaliacao-actions").style.display = "none";
        document.querySelector(".avaliacao-rodape").style.display = "none";
        document.getElementById("etapa-enviada").style.display = "block";

    } catch (err) {
        console.error(err);
        alert("Não foi possível enviar sua avaliação. Tente novamente.");
        btnEnviar.disabled = false;
        btnEnviar.innerHTML = `<i class="bi bi-check-circle"></i> Enviar Avaliação`;
    }
});