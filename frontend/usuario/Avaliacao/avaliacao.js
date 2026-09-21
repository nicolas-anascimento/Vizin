// ================= PROTEGER PÁGINA =================
if (!localStorage.getItem("token")) {
    window.location.href = "/login";
}

const usuarioLogado = JSON.parse(localStorage.getItem("usuario") || "null");

// ================= LER SOLICITAÇÃO =================
const params = new URLSearchParams(window.location.search);
const solicitacaoId = params.get("solicitacaoId");

// Tudo abaixo roda depois que as solicitações do usuário foram carregadas do
// back (SolicitacoesVizin.pronto). Ids são UUID em texto — nada de Number().
(async function iniciarPagina() {
await (window.SolicitacoesVizin ? window.SolicitacoesVizin.pronto : Promise.resolve());

const solicitacao = solicitacaoId ? window.SolicitacoesVizin?.obterPorId(solicitacaoId) : null;

if (!solicitacao) {
    document.querySelector(".avaliacao-container").innerHTML =
        `<p style="text-align:center; padding: 60px 20px; color: var(--texto-suave);">
            Não foi possível encontrar esta locação.
        </p>`;
    throw new Error("Solicitação não encontrada");
}

const aluguelId = solicitacao.id;

if (!solicitacao.souProprietario && !solicitacao.souSolicitante) {
    document.querySelector(".avaliacao-container").innerHTML =
        `<p style="text-align:center; padding: 60px 20px; color: var(--texto-suave);">
            Você não participou desta locação.
        </p>`;
    throw new Error("Usuário não participa da solicitação");
}

const meuPapel = solicitacao.souProprietario ? "proprietario" : "locatario";
const papelDaOutraParte = meuPapel === "locatario" ? "proprietario" : "locatario";

const nomeOutraParte = meuPapel === "locatario"
    ? (solicitacao.proprietarioNome || "Proprietário")
    : (solicitacao.solicitanteNome || "Locatário");

document.getElementById("link-voltar").addEventListener("click", (e) => {
    e.preventDefault();
    window.location.href = `/historico`;
});
document.getElementById("btn-cancelar").addEventListener("click", () => {
    window.location.href = `/historico`;
});
document.getElementById("btn-voltar-historico").href = "/historico";

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
const nomeEscapado = String(nomeOutraParte).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
document.getElementById("produto-mini-outraparte").innerHTML = meuPapel === "locatario"
    ? `Proprietário: <strong>${nomeEscapado}</strong>`
    : `Você está avaliando: <strong>${nomeEscapado}</strong> (locatário)`;

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
        await AvaliacoesVizin.avaliar(aluguelId, meuPapel, notaSelecionada, comentario);

        // A notificação "avaliação recebida" é gerada pelo back-end.

        document.querySelectorAll(".card:not(#etapa-enviada)").forEach(el => el.style.display = "none");
        document.querySelector(".avaliacao-actions").style.display = "none";
        document.querySelector(".avaliacao-rodape").style.display = "none";
        document.getElementById("etapa-enviada").style.display = "block";

    } catch (err) {
        console.error(err);
        alert(err?.codigo === "conflito"
            ? "Esta avaliação já foi enviada ou a locação ainda não pode ser avaliada."
            : "Não foi possível enviar sua avaliação. Tente novamente.");
        btnEnviar.disabled = false;
        btnEnviar.innerHTML = `<i class="bi bi-check-circle"></i> Enviar Avaliação`;
    }
});

// ================= JÁ AVALIOU? =================
// AvaliacoesVizin agora bate na API real (fetch), então essa checagem é
// assíncrona. Este script é carregado como script clássico (sem
// type="module"), então "await" solto no topo do arquivo não é válido —
// por isso a checagem fica dentro desta função autoexecutável. Enquanto ela
// roda, o formulário fica visível (comportamento padrão do HTML); se a
// chamada falhar (ex: back-end fora do ar), deixamos o formulário disponível
// mesmo assim — quem realmente impede uma segunda avaliação é o back-end.
(async function verificarSeJaAvaliou() {
    let jaEnviouAvaliacao = false;
    try {
        jaEnviouAvaliacao = await AvaliacoesVizin.jaAvaliou(aluguelId, meuPapel);
    } catch (err) {
        console.error("Não foi possível verificar se a avaliação já foi enviada:", err);
        return;
    }

    if (jaEnviouAvaliacao) {
        document.querySelectorAll(".card:not(#etapa-enviada)").forEach(el => el.style.display = "none");
        document.querySelector(".avaliacao-actions").style.display = "none";
        document.querySelector(".avaliacao-rodape").style.display = "none";
        document.getElementById("etapa-enviada").style.display = "block";
    }
})();

})();