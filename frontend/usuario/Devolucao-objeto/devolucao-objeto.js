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
function parseDataISOLocal(dataStr) {
    if (!dataStr) return null;
    const partes = dataStr.split("-").map(Number);
    if (partes.length !== 3 || partes.some(Number.isNaN)) return null;
    const [ano, mes, dia] = partes;
    return new Date(ano, mes - 1, dia);
}

const formatarReal = window.SolicitacoesVizin.formatarReal;

(function mostrarPrazo() {
    if (!solicitacao.dataDevolucao || solicitacao.status !== "retirado") return;

    const dataDevolucao = parseDataISOLocal(solicitacao.dataDevolucao);
    if (!dataDevolucao) return;

    const hoje = new Date();
    hoje.setHours(0, 0, 0, 0);
    const diffDias = Math.round((dataDevolucao - hoje) / (1000 * 60 * 60 * 24));
    const dataFormatada = solicitacao.dataDevolucao.split("-").reverse().join("/");

    const prazoCard = document.getElementById("prazo-card");
    const prazoTexto = document.getElementById("prazo-texto");
    if (!prazoCard || !prazoTexto) return;

    let texto;
    if (diffDias > 1) {
        texto = `Faltam ${diffDias} dias para o prazo da devolução (${dataFormatada}).`;
    } else if (diffDias === 1) {
        texto = `A devolução precisa ser confirmada até amanhã (${dataFormatada}).`;
    } else if (diffDias === 0) {
        texto = "A devolução precisa ser confirmada hoje.";
        prazoCard.classList.add("prazo-urgente");
    } else {
        const diasAtraso = Math.abs(diffDias);
        texto = `Devolução em atraso há ${diasAtraso} dia(s) (prazo era ${dataFormatada}). Enquanto o objeto não for devolvido, ${meuPapel === "locatario" ? "sua conta fica impedida de solicitar novos aluguéis ou aprovar locações" : "a conta de quem alugou fica restrita"}.`;
        prazoCard.classList.add("prazo-urgente");

        // O valor da multa é do back-end (projeção até a devolução ser confirmada).
        window.SolicitacoesVizin.obterMulta(solicitacao.id).then(m => {
            if (m && m.valorTotal > 0) {
                prazoTexto.textContent = `${texto} Já acumulou ${formatarReal(m.valorTotal)} de multa (${formatarReal(m.valorDia)}/dia), cobrados quando a devolução for confirmada.`;
            }
        }).catch(() => { /* mantém o texto sem valor */ });
    }

    prazoTexto.textContent = texto;
    prazoCard.style.display = "flex";
})();

// ================= RESUMO DA MULTA ANTES DE CONFIRMAR =================
// Repete o valor exato perto do botão de confirmar, pra ninguém confirmar a
// devolução sem saber quanto vai ser cobrado (ou recebido). Valores do back.
(function mostrarResumoMultaAntesConfirmar() {
    const resumoEl = document.getElementById("resumo-multa-confirmar");
    if (!resumoEl || solicitacao.status !== "retirado") return;

    window.SolicitacoesVizin.obterMulta(solicitacao.id).then(multa => {
        if (!multa || multa.diasAtraso <= 0) return;

        const textoValor = meuPapel === "locatario"
            ? `<strong>${formatarReal(multa.valorTotal)} será cobrado agora</strong> ao confirmar a devolução`
            : `<strong>${formatarReal(multa.valorProprietario)} será creditado a você</strong> ao confirmar a devolução`;

        resumoEl.innerHTML = `
            <i class="bi bi-receipt"></i>
            <span>${textoValor} — ${multa.diasAtraso} dia(s) de atraso (${formatarReal(multa.valorDia)}/dia).</span>
        `;
        resumoEl.classList.add("prazo-urgente");
        resumoEl.style.display = "flex";
    }).catch(() => { /* sem resumo: o valor final aparece após confirmar */ });
})();

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

    // Snapshot congelado da multa (se houve atraso), vindo do back.
    const atual = window.SolicitacoesVizin.obterPorId(solicitacao.id);
    const multa = atual?.multaAtraso || { diasAtraso: 0, valorTotal: 0, valorPlataforma: 0, valorProprietario: 0 };

    const notaMulta = document.getElementById("confirmada-multa-nota");
    if (notaMulta) {
        if (multa.diasAtraso > 0) {
            notaMulta.textContent = meuPapel === "locatario"
                ? `${formatarReal(multa.valorTotal)} de multa por ${multa.diasAtraso} dia(s) de atraso na devolução — o pagamento é feito na próxima etapa.`
                : `A devolução ficou ${multa.diasAtraso} dia(s) em atraso: você vai receber ${formatarReal(multa.valorProprietario)} de multa (a plataforma retém ${formatarReal(multa.valorPlataforma)}) assim que o locatário pagar.`;
            notaMulta.classList.remove("hidden");
        } else {
            notaMulta.classList.add("hidden");
        }
    }

    atualizarAcaoMulta(atual, multa);

    document.getElementById("etapa-enviar").style.display = "none";
    document.getElementById("etapa-aguardando").style.display = "none";
    document.getElementById("etapa-confirmada").style.display = "block";
}

// ================= PAGAR A MULTA =================
// Mostra (só pro locatário) o botão de pagar a multa obrigatória. O
// pagamento acontece na página dedicada (/pagamento-multa).
function atualizarAcaoMulta(solic, multa) {
    const acaoCard = document.getElementById("confirmada-multa-acao");
    const textoAcao = document.getElementById("confirmada-multa-acao-texto");
    const btnPagar = document.getElementById("btn-pagar-multa");
    if (!acaoCard) return;

    if (meuPapel !== "locatario" || !multa || multa.diasAtraso <= 0 || !window.SolicitacoesVizin) {
        acaoCard.classList.add("hidden");
        return;
    }

    const status = solic?.multaStatus || "pendente";
    acaoCard.classList.remove("hidden", "multa-acao-ok", "multa-acao-suspensa");

    if (status === "paga") {
        textoAcao.textContent = "Multa paga. Sua conta está liberada para novas locações.";
        if (btnPagar) btnPagar.style.display = "none";
        acaoCard.classList.add("multa-acao-ok");
        return;
    }

    if (status === "contestada") {
        textoAcao.textContent = "Multa contestada. A cobrança fica suspensa até o Suporte analisar seu relato.";
        if (btnPagar) btnPagar.style.display = "none";
        acaoCard.classList.add("multa-acao-suspensa");
        return;
    }

    textoAcao.textContent = "Enquanto essa multa não for paga, você não pode solicitar novos aluguéis nem aprovar locações nos seus próprios objetos.";
    if (btnPagar) btnPagar.style.display = "";
}

const btnPagarMulta = document.getElementById("btn-pagar-multa");
if (btnPagarMulta) {
    btnPagarMulta.addEventListener("click", () => {
        window.location.href = `/pagamento-multa?solicitacaoId=${encodeURIComponent(solicitacao.id)}`;
    });
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
