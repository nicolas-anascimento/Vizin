// Precisa existir já aqui em cima: se a página é recarregada com as fotos já
// enviadas, o fluxo abaixo chama mostrarAguardando() -> acompanharOutraParte()
// bem cedo (antes da seção "TROCA DE ESTADOS"), e essa função usa essa
// variável. Declarada lá embaixo, o "let" ficava numa zona morta até aquele
// ponto do arquivo ser executado, e o acesso antecipado quebrava o script
// inteiro no meio — por isso o botão de simulação (registrado mais abaixo)
// nunca chegava a ganhar seu listener.
let intervaloAcompanhamento = null;

// ================= TOAST (mesmo padrão do Histórico) =================
function mostrarToast(mensagem, tipo = "sucesso") {
    const toast = document.getElementById("toast");
    if (!toast) return;

    toast.innerText = mensagem;
    toast.className = `toast show ${tipo}`;

    setTimeout(() => {
        toast.classList.remove("show");
    }, 3000);
}

// ================= LER DADOS DA URL =================
// Só o id da solicitação vem da URL — objeto, datas e partes vêm do back.
const params = new URLSearchParams(window.location.search);
const solicitacaoIdParam = params.get("solicitacaoId");

// Tudo abaixo roda depois que as solicitações foram carregadas do back.
// Ids são UUID em texto — nada de Number().
(async function iniciarPagina() {
await (window.SolicitacoesVizin ? window.SolicitacoesVizin.pronto : Promise.resolve());

const solicitacao = solicitacaoIdParam ? window.SolicitacoesVizin?.obterPorId(solicitacaoIdParam) : null;
const aluguelId = solicitacao ? solicitacao.id : null;


const urlStatus = solicitacaoIdParam
    ? `/status-locacao?solicitacaoId=${encodeURIComponent(solicitacaoIdParam)}`
    : `/historico`;

document.getElementById("link-voltar").addEventListener("click", (e) => {
    e.preventDefault();
    window.location.href = urlStatus;
});
document.getElementById("btn-cancelar").addEventListener("click", () => {
    window.location.href = urlStatus;
});

// ================= SOLICITAÇÃO NÃO ENCONTRADA / SEM ACESSO / FORA DE ETAPA =================
function mostrarEstadoInvalido(idEtapa) {
    document.getElementById("conteudo-devolucao").style.display = "none";
    document.getElementById(idEtapa).style.display = "block";
}

if (!solicitacao) { mostrarEstadoInvalido("etapa-erro"); return; }
if (!solicitacao.souProprietario && !solicitacao.souSolicitante) { mostrarEstadoInvalido("etapa-acesso-negado"); return; }

// Só existe devolução para locação em andamento (retirada feita) ou já concluída.
if (!["retirado", "concluido"].includes(solicitacao.status)) { mostrarEstadoInvalido("etapa-erro"); return; }

const produto = {
    id: solicitacao.produtoId,
    titulo: solicitacao.produtoTitulo,
    categoria: solicitacao.produtoCategoria || "",
    imagem: solicitacao.imagemProduto || "/assets/usuario/img/sem-imagem.jpg",
    proprietario: { nome: solicitacao.proprietarioNome || "Proprietário" }
};

document.getElementById("produto-mini-imagem").src = produto.imagem;
document.getElementById("produto-mini-nome").textContent = produto.titulo;
document.getElementById("produto-mini-categoria").textContent = produto.categoria;
document.getElementById("produto-mini-proprietario").textContent = produto.proprietario.nome;
document.getElementById("btn-ver-status").href = urlStatus;

// Declarada aqui porque várias funções abaixo a usam antes do bloco de upload.
let fotosJaEnviadas = false;

// ================= PAPEL DE QUEM ESTÁ LOGADO =================
// Definido pelo back (participante da solicitação) — sem alternância de teste.
const meuPapel = solicitacao.souProprietario ? "proprietario" : "locatario";
const papelDaOutraParte = meuPapel === "locatario" ? "proprietario" : "locatario";

const nomesPapel = {
    locatario: "Locatário",
    proprietario: "Proprietário"
};

const minhaParteHeader = document.getElementById("minha-parte-header");
const minhaParteAvatar = document.getElementById("minha-parte-avatar");
const dropzoneEl = document.getElementById("dropzone-minhas-fotos");
minhaParteHeader.classList.add(`papel-${meuPapel}`);
minhaParteAvatar.classList.add(`papel-${meuPapel}`);
dropzoneEl.classList.add(`papel-${meuPapel}`);
document.getElementById("minha-parte-nome").textContent = `Suas fotos (${nomesPapel[meuPapel]})`;
document.getElementById("devolucao-subtitulo").textContent =
    meuPapel === "locatario"
        ? "Registre suas fotos do objeto no momento da devolução"
        : "Registre suas fotos confirmando o recebimento do objeto";

// ================= PRAZO / ATRASO DA DEVOLUÇÃO (visível na própria tela) =================
// REGRA: a devolução deve ser confirmada até as 23:59 do dia agendado; a partir
// das 00:00 do dia seguinte começa a contar multa diária. O cálculo do "hoje"
// (fuso de São Paulo) fica em DevolucaoVizin.prazo(); o VALOR da multa é sempre
// do back-end.

const AVISO_ATRASO = "Depois desse prazo a devolução fica registrada como em atraso.";

function renderizarPrazo() {
    const prazoCard = document.getElementById("prazo-card");
    const prazoTexto = document.getElementById("prazo-texto");
    if (!prazoCard || !prazoTexto) return;
    if (!solicitacao.dataDevolucao || solicitacao.status !== "retirado") return;

    const p = DevolucaoVizin.prazo(solicitacao.dataDevolucao);
    if (!p) return;

    const dataFormatada = p.dataISO.split("-").reverse().join("/");
    prazoCard.classList.remove("prazo-urgente");

    let texto;
    if (p.estado === "futura" && p.diff > 1) {
        texto = `Faltam ${p.diff} dias para o prazo da devolução (${dataFormatada}). A devolução deve ser confirmada até as 23:59 desse dia. ${AVISO_ATRASO}`;
    } else if (p.estado === "futura") {
        texto = `A devolução precisa ser confirmada até amanhã (${dataFormatada}), às 23:59. ${AVISO_ATRASO}`;
        prazoCard.classList.add("prazo-urgente");
    } else if (p.estado === "hoje") {
        texto = `A devolução precisa ser confirmada hoje, até as 23:59. ${AVISO_ATRASO}`;
        prazoCard.classList.add("prazo-urgente");
    } else {
        texto = `Devolução em atraso há ${p.diasAtraso} dia(s): o prazo terminou às 23:59 de ${dataFormatada}. Enquanto o objeto não for devolvido, ${meuPapel === "locatario" ? "sua conta fica impedida de solicitar novos aluguéis ou aprovar locações" : "a conta de quem alugou fica restrita"}. Eventuais valores devem ser combinados diretamente entre locador e locatário.`;
        prazoCard.classList.add("prazo-urgente");
    }

    prazoTexto.textContent = texto;
    prazoCard.style.display = "flex";
}

renderizarPrazo();

// Se a tela ficar aberta na virada do dia (00:00 de São Paulo), o prazo passa
// de "hoje" pra "em atraso" sozinho, sem perder as fotos já selecionadas.
DevolucaoVizin.aoVirarODia(() => {
    renderizarPrazo();
});

// ================= COMPRESSÃO DAS FOTOS ANTES DO ENVIO =================
// O back aceita até 5 MB por foto: redimensionamos (lado maior até 1600 px) e
// reenviamos como JPEG. O envio é multipart com o arquivo — sem base64.
function comprimirImagem(arquivo, larguraMax = 1600, qualidade = 0.82) {
    return new Promise((resolve, reject) => {
        const url = URL.createObjectURL(arquivo);
        const img = new Image();
        img.onload = () => {
            URL.revokeObjectURL(url);
            const escala = Math.min(1, larguraMax / img.width);
            const canvas = document.createElement("canvas");
            canvas.width = Math.round(img.width * escala);
            canvas.height = Math.round(img.height * escala);
            canvas.getContext("2d").drawImage(img, 0, 0, canvas.width, canvas.height);
            canvas.toBlob(blob => {
                if (!blob) return reject(new Error("Não foi possível processar a imagem."));
                const nome = (arquivo.name || "foto").replace(/\.[^.]+$/, "") + ".jpg";
                resolve(new File([blob], nome, { type: "image/jpeg" }));
            }, "image/jpeg", qualidade);
        };
        img.onerror = () => {
            URL.revokeObjectURL(url);
            reject(new Error("Não foi possível ler uma das imagens."));
        };
        img.src = url;
    });
}

async function comprimirFotos(arquivos) {
    const resultado = [];
    for (const arquivo of arquivos) {
        resultado.push(await comprimirImagem(arquivo));
    }
    return resultado;
}

// ================= UPLOAD DE FOTOS (só as minhas) =================
const MAX_FOTOS = 3;
let minhasFotos = [];

const dropzone = dropzoneEl;
const input = document.getElementById("input-minhas-fotos");
const fotosGrid = document.getElementById("fotos-grid-minhas");
const badge = document.getElementById("badge-minhas-fotos");
const btnEnviar = document.getElementById("btn-enviar-minhas-fotos");

dropzone.addEventListener("click", () => input.click());

input.addEventListener("change", (e) => {
    adicionarArquivos(Array.from(e.target.files));
    input.value = "";
});

["dragenter", "dragover"].forEach(evento => {
    dropzone.addEventListener(evento, (e) => {
        e.preventDefault();
        dropzone.classList.add("arrastando");
    });
});

["dragleave", "drop"].forEach(evento => {
    dropzone.addEventListener(evento, (e) => {
        e.preventDefault();
        dropzone.classList.remove("arrastando");
    });
});

dropzone.addEventListener("drop", (e) => {
    e.preventDefault();
    dropzone.classList.remove("arrastando");
    adicionarArquivos(Array.from(e.dataTransfer.files));
});

function adicionarArquivos(arquivos) {
    const espacoRestante = MAX_FOTOS - minhasFotos.length;

    if (arquivos.length > espacoRestante) {
        mostrarToast(`Só cabem mais ${espacoRestante} foto(s). O restante foi ignorado.`, "erro");
    }

    let algumInvalido = false;
    arquivos.slice(0, espacoRestante).forEach(arquivo => {
        if (!arquivo.type.startsWith("image/")) {
            algumInvalido = true;
            return;
        }
        minhasFotos.push(arquivo);
    });

    if (algumInvalido) {
        mostrarToast("Só são aceitos arquivos de imagem (PNG, JPG ou JPEG).", "erro");
    }

    renderizarFotos();
}

function renderizarFotos() {
    fotosGrid.innerHTML = "";

    minhasFotos.forEach((arquivo, index) => {
        const slot = document.createElement("div");
        slot.className = "parte-foto-slot";

        const img = document.createElement("img");
        img.src = URL.createObjectURL(arquivo);
        img.style.cursor = "zoom-in";
        img.addEventListener("click", (ev) => {
            ev.stopPropagation();
            abrirZoomFoto(img.src);
        });
        slot.appendChild(img);

        const removerBtn = document.createElement("button");
        removerBtn.type = "button";
        removerBtn.className = "parte-foto-remover";
        removerBtn.innerHTML = "&times;";
        removerBtn.addEventListener("click", (ev) => {
            ev.stopPropagation();
            minhasFotos.splice(index, 1);
            renderizarFotos();
        });
        slot.appendChild(removerBtn);

        fotosGrid.appendChild(slot);
    });

    badge.textContent = `${minhasFotos.length}/${MAX_FOTOS}`;
    dropzone.style.display = minhasFotos.length >= MAX_FOTOS ? "none" : "flex";
    btnEnviar.disabled = minhasFotos.length === 0;
}

// ================= ZOOM DE FOTO =================
const zoomOverlay = document.getElementById("foto-zoom-overlay");
const zoomImg = document.getElementById("foto-zoom-img");
 
function abrirZoomFoto(src) {
    if (!zoomOverlay || !zoomImg) return;
    zoomImg.src = src;
    zoomOverlay.classList.add("show");
}
 
if (zoomOverlay) {
    zoomOverlay.addEventListener("click", () => zoomOverlay.classList.remove("show"));
}
 
// ================= AVISO AO SAIR COM FOTOS NÃO ENVIADAS =================
window.addEventListener("beforeunload", (e) => {
    if (minhasFotos.length > 0 && !fotosJaEnviadas) {
        e.preventDefault();
        e.returnValue = "";
    }
});

// ================= STATUS DAS DUAS PARTES (vem do back) =================
function renderizarStatus() {
    const status = DevolucaoVizin.obterStatus(aluguelId);
    const statusLista = document.getElementById("status-lista");
    statusLista.innerHTML = "";

    ["locatario", "proprietario"].forEach(papel => {
        const dados = status[papel];
        const souEu = papel === meuPapel;

        const linha = document.createElement("div");
        linha.className = "status-linha";

        const icone = document.createElement("div");
        icone.className = `status-linha-icone ${dados.enviado ? "completo" : "pendente"}`;
        icone.innerHTML = dados.enviado ? `<i class="bi bi-check-lg"></i>` : `<i class="bi bi-clock-history"></i>`;

        const texto = document.createElement("div");
        texto.className = "status-linha-texto";
        texto.textContent = `${nomesPapel[papel]}${souEu ? " (você)" : ""}`;
        const sub = document.createElement("span");
        sub.className = "status-linha-sub";
        sub.textContent = dados.enviado ? `${dados.quantidade} foto(s) enviada(s)` : "Ainda não enviou as fotos";
        texto.appendChild(sub);

        linha.appendChild(icone);
        linha.appendChild(texto);
        statusLista.appendChild(linha);
    });

    return status;
}

// A devolução está concluída quando as duas partes enviaram (ou quando a
// locação já foi encerrada pelo back).
function devolucaoConcluida() {
    const atual = window.SolicitacoesVizin.obterPorId(solicitacao.id);
    return DevolucaoVizin.ambosConcluidos(aluguelId) || (atual && atual.status === "concluido");
}

// ================= ENVIAR MINHAS FOTOS =================
btnEnviar.addEventListener("click", async () => {
    if (minhasFotos.length === 0) return;

    btnEnviar.disabled = true;
    btnEnviar.innerHTML = `<span class="spinner"></span> Enviando...`;

    const observacoes = document.getElementById("observacoes").value.trim();

    try {
        const fotos = await comprimirFotos(minhasFotos);

        // O papel vem do token. Quando a 2ª parte envia, o back encerra a locação,
        // congela a multa (se houve atraso), libera o objeto e notifica as partes.
        await DevolucaoVizin.enviarFotos(aluguelId, { fotos, observacoes });
        fotosJaEnviadas = true;

        try { await window.SolicitacoesVizin.atualizar(); } catch (e) { console.error(e); }
        renderizarStatus();

        if (devolucaoConcluida()) {
            finalizarDevolucao();
        } else {
            mostrarAguardando();
        }

    } catch (err) {
        console.error(err);

        let mensagem;
        if (navigator.onLine === false || err.codigo === "rede") {
            mensagem = "Você está sem conexão com a internet. Verifique sua rede e tente novamente.";
        } else if (err.codigo === "conflito") {
            mensagem = "Esta locação não está mais na etapa de devolução. Atualize a página.";
        } else {
            mensagem = err.message || "Não foi possível enviar suas fotos. Tente novamente.";
        }

        mostrarToast(mensagem, "erro");
        btnEnviar.disabled = false;
        btnEnviar.innerHTML = `<i class="bi bi-check-circle"></i> Confirmar Devolução`;
    }
});

// ================= TROCA DE ESTADOS =================
function mostrarAguardando() {
    document.getElementById("etapa-enviar").style.display = "none";
    document.getElementById("etapa-aguardando").style.display = "block";
    document.getElementById("etapa-confirmada").style.display = "none";

    document.getElementById("aguardando-texto").textContent =
        `Aguardando o envio das fotos de ${nomesPapel[papelDaOutraParte].toLowerCase()}.`;

    acompanharOutraParte();
}

// Fecha o ciclo da devolução na tela. Status, multa, disponibilidade do
// objeto e notificações são todos definidos pelo back-end.
function finalizarDevolucao() {
    clearInterval(intervaloAcompanhamento);
    fotosJaEnviadas = true;

    // Registro do atraso (só informativo). A plataforma não cobra nem repassa
    // valores: qualquer acerto é entre locador e locatário.
    const atual = window.SolicitacoesVizin.obterPorId(solicitacao.id);
    const diasAtraso = atual?.multaAtraso?.diasAtraso || 0;

    const notaAtraso = document.getElementById("confirmada-multa-nota");
    if (notaAtraso) {
        if (diasAtraso > 0) {
            notaAtraso.textContent = `A devolução ficou ${diasAtraso} dia(s) em atraso. O atraso foi registrado; eventuais valores devem ser combinados diretamente entre locador e locatário.`;
            notaAtraso.classList.remove("hidden");
        } else {
            notaAtraso.classList.add("hidden");
        }
    }

    document.getElementById("etapa-enviar").style.display = "none";
    document.getElementById("etapa-aguardando").style.display = "none";
    document.getElementById("etapa-confirmada").style.display = "block";
}

// Consulta o back a cada 5 s enquanto espera a outra parte (sem WebSocket).
function acompanharOutraParte() {
    clearInterval(intervaloAcompanhamento);

    intervaloAcompanhamento = setInterval(async () => {
        try {
            await Promise.all([DevolucaoVizin.carregar(aluguelId), window.SolicitacoesVizin.atualizar()]);
        } catch (erro) {
            console.error("Não foi possível atualizar o status da devolução:", erro);
            return; // tenta de novo no próximo ciclo
        }

        renderizarStatus();
        if (devolucaoConcluida()) {
            finalizarDevolucao();
        }
    }, 5000);
}

// ================= ESTADO INICIAL =================
// Carrega o que já foi enviado (por mim ou pela outra parte). Se eu já enviei
// e reabri a página, pula direto pro estado de aguardando/confirmado.
try {
    await DevolucaoVizin.carregar(aluguelId);
} catch (erro) {
    console.error("Não foi possível carregar o status da devolução:", erro);
    mostrarToast(erro.message || "Não foi possível carregar o status da devolução.", "erro");
}

renderizarStatus();

if (devolucaoConcluida()) {
    finalizarDevolucao();
} else if (DevolucaoVizin.obterStatus(aluguelId)[meuPapel].enviado) {
    mostrarAguardando();
}

})();