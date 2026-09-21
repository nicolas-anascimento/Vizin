// ================= PROTEGER PÁGINA =================
if (!localStorage.getItem("token")) {
    window.location.href = "/login";
}
 
// ================= USUÁRIO LOGADO =================
const usuarioLogado = JSON.parse(localStorage.getItem("usuario") || "null");
 
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


const urlVoltar = solicitacao
    ? `/produto?id=${solicitacao.produtoId}`
    : `/historico`;

document.getElementById("link-voltar").addEventListener("click", (e) => {
    e.preventDefault();
    window.location.href = urlVoltar;
});

// ================= SOLICITAÇÃO NÃO ENCONTRADA / SEM ACESSO =================
if (!solicitacao) {
    document.getElementById("conteudo-retirada").style.display = "none";
    document.getElementById("etapa-erro").style.display = "block";
    return;
}

if (!solicitacao.souProprietario && !solicitacao.souSolicitante) {
    document.getElementById("conteudo-retirada").style.display = "none";
    document.getElementById("etapa-acesso-negado").style.display = "block";
    return;
}

// Só existe retirada para locação paga (ou já além disso). Antes de pagar,
// não há o que registrar aqui.
if (["pendente", "aprovado", "rejeitado"].includes(solicitacao.status)) {
    document.getElementById("conteudo-retirada").style.display = "none";
    document.getElementById("etapa-erro").style.display = "block";
    return;
}

// Declarada aqui (e não junto do upload) porque as funções de cancelamento a usam.
let fotosJaEnviadas = false;

const produto = {
    id: solicitacao.produtoId,
    titulo: solicitacao.produtoTitulo,
    categoria: solicitacao.produtoCategoria || "",
    imagem: solicitacao.imagemProduto || "../img/sem-imagem.jpg",
    proprietario: { nome: solicitacao.proprietarioNome || "Proprietário" }
};

document.getElementById("produto-mini-imagem").src = produto.imagem;
document.getElementById("produto-mini-nome").textContent = produto.titulo;
document.getElementById("produto-mini-categoria").textContent = produto.categoria;
document.getElementById("produto-mini-proprietario").textContent = produto.proprietario.nome;

// ================= CANCELAR LOCAÇÃO (via modal de confirmação) =================
// Último ponto em que dá pra cancelar: assim que a retirada é confirmada
// pelas duas partes, a locação já está em andamento e deixa de ser cancelável.
// Tanto o locatário quanto o proprietário podem cancelar por aqui.
const modalCancelar = document.getElementById("modal-cancelar");
const modalCancelarVoltar = document.getElementById("modal-cancelar-voltar");
const modalCancelarConfirmar = document.getElementById("modal-cancelar-confirmar");

function abrirModalCancelar() {
    modalCancelar.classList.add("show");
}

function fecharModalCancelar() {
    modalCancelar.classList.remove("show");
}

modalCancelarVoltar.addEventListener("click", fecharModalCancelar);

modalCancelar.addEventListener("click", (e) => {
    if (e.target === modalCancelar) fecharModalCancelar();
});

modalCancelarConfirmar.addEventListener("click", async () => {
    if (modalCancelarConfirmar.disabled) return;
    modalCancelarConfirmar.disabled = true;
    modalCancelarConfirmar.textContent = "Cancelando...";

    try {
        // O back estorna (se houver pagamento) e libera o objeto.
        await window.SolicitacoesVizin.cancelar(solicitacao.id);
        fotosJaEnviadas = true; // não avisar "fotos não enviadas" ao sair
        window.location.href = `/historico`;
    } catch (erro) {
        console.error(erro);
        mostrarToast(erro.message || "Não foi possível cancelar. Tente novamente.", "erro");
        modalCancelarConfirmar.disabled = false;
        modalCancelarConfirmar.textContent = "Cancelar Locação";
    }
});

document.getElementById("btn-cancelar").addEventListener("click", abrirModalCancelar);

const btnCancelarAguardando = document.getElementById("btn-cancelar-aguardando");
if (btnCancelarAguardando) {
    btnCancelarAguardando.addEventListener("click", abrirModalCancelar);
}

// ================= REAGIR A CANCELAMENTO (AUTOMÁTICO OU PELA OUTRA PARTE) =================
// O back cancela sozinho (prazo vencido etc.). Sem essa checagem, alguém poderia
// terminar de enviar fotos depois do cancelamento. `intervaloAcompanhamento`
// só é lido de dentro da função, então pode ser declarada mais abaixo.
function verificarSeFoiCancelada() {
    const atual = window.SolicitacoesVizin.obterPorId(solicitacao.id);
    if (atual && atual.status === "cancelado") {
        clearInterval(intervaloAcompanhamento);
        fotosJaEnviadas = true;
        alert(atual.canceladoPeloSistema
            ? "O prazo para retirada deste objeto expirou e a locação foi cancelada automaticamente. Se houve pagamento, o estorno está em andamento."
            : "Esta locação foi cancelada.");
        window.location.href = `/historico`;
        return true;
    }
    return false;
}

document.addEventListener("solicitacoesAtualizadas", verificarSeFoiCancelada);
if (verificarSeFoiCancelada()) return;

// ================= PAPEL DE QUEM ESTÁ LOGADO =================
// Definido pelo back (participante da solicitação) — sem alternância de teste.
const meuPapel = solicitacao.souProprietario ? "proprietario" : "locatario";
const papelDaOutraParte = meuPapel === "locatario" ? "proprietario" : "locatario";

const nomesPapel = {
    locatario: "Locatário",
    proprietario: "Proprietário"
};

// Ajusta o cabeçalho da minha zona de upload de acordo com o meu papel
const minhaParteHeader = document.getElementById("minha-parte-header");
const minhaParteAvatar = document.getElementById("minha-parte-avatar");
minhaParteHeader.classList.add(`papel-${meuPapel}`);
minhaParteAvatar.classList.add(`papel-${meuPapel}`);
document.getElementById("minha-parte-nome").textContent = `Suas fotos (${nomesPapel[meuPapel]})`;
document.getElementById("retirada-subtitulo").textContent =
    meuPapel === "locatario"
        ? "Registre suas fotos com o objeto no momento da retirada"
        : "Registre suas fotos confirmando a entrega do objeto";

// ================= PRAZO DA RETIRADA (visível na própria tela) =================
function parseDataISOLocal(dataStr) {
    if (!dataStr) return null;
    const partes = dataStr.split("-").map(Number);
    if (partes.length !== 3 || partes.some(Number.isNaN)) return null;
    const [ano, mes, dia] = partes;
    return new Date(ano, mes - 1, dia);
}
 
(function mostrarPrazo() {
    if (!solicitacao || !solicitacao.dataRetirada) return;
    if (solicitacao.status !== "pago") return; // já retirado/cancelado: prazo não se aplica mais
 
    const dataRetirada = parseDataISOLocal(solicitacao.dataRetirada);
    if (!dataRetirada) return;
 
    const hoje = new Date();
    hoje.setHours(0, 0, 0, 0);
    const diffDias = Math.round((dataRetirada - hoje) / (1000 * 60 * 60 * 24));
 
    const prazoCard = document.getElementById("prazo-card");
    const prazoTexto = document.getElementById("prazo-texto");
    if (!prazoCard || !prazoTexto) return;
 
    let texto;
    if (diffDias > 1) {
        texto = `Faltam ${diffDias} dias para o prazo da retirada (${solicitacao.dataRetirada.split("-").reverse().join("/")}).`;
    } else if (diffDias === 1) {
        texto = `A retirada precisa ser confirmada até amanhã (${solicitacao.dataRetirada.split("-").reverse().join("/")}).`;
    } else if (diffDias === 0) {
        texto = "A retirada precisa ser confirmada hoje, ou o aluguel poderá ser cancelado automaticamente.";
        prazoCard.classList.add("prazo-urgente");
    } else {
        return; // já passou — verificarSeFoiCancelada cuida disso
    }
 
    prazoTexto.textContent = texto;
    prazoCard.style.display = "flex";
})();
 
// ================= COMPRESSÃO DAS FOTOS ANTES DO ENVIO =================
// O back aceita até 5 MB por foto. Fotos de celular costumam passar disso,
// então redimensionamos (lado maior até 1600 px) e reenviamos como JPEG.
// Quem envia é o arquivo (multipart) — nada de base64 nem de localStorage.
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
 
const dropzone = document.getElementById("dropzone-minhas-fotos");
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
// Sem isso, tirar 3 fotos e fechar a aba/voltar sem clicar em "Enviar"
// perdia tudo silenciosamente.
window.addEventListener("beforeunload", (e) => {
    if (minhasFotos.length > 0 && !fotosJaEnviadas) {
        e.preventDefault();
        e.returnValue = "";
    }
});
 
// ================= STATUS DAS DUAS PARTES (vem do back) =================
function renderizarStatus() {
    const status = RetiradaVizin.obterStatus(aluguelId);
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

// A retirada está concluída quando as duas partes enviaram (ou quando a
// própria locação já avançou de status — o back é a fonte da verdade).
function retiradaConcluida() {
    const atual = window.SolicitacoesVizin.obterPorId(solicitacao.id);
    return RetiradaVizin.ambosConcluidos(aluguelId)
        || (atual && ["retirado", "concluido"].includes(atual.status));
}

// ================= ENVIAR MINHAS FOTOS =================
btnEnviar.addEventListener("click", async () => {
    if (minhasFotos.length === 0) return;
    if (verificarSeFoiCancelada()) return;

    btnEnviar.disabled = true;
    btnEnviar.innerHTML = `<span class="spinner"></span> Enviando...`;

    const observacoes = document.getElementById("observacoes").value.trim();

    try {
        const fotos = await comprimirFotos(minhasFotos);

        // O papel de quem envia vem do token. Se esta for a 2ª parte a enviar, o
        // back muda a solicitação para "retirado" e gera as notificações sozinho.
        await RetiradaVizin.enviarFotos(aluguelId, { fotos, observacoes });
        fotosJaEnviadas = true;

        try { await window.SolicitacoesVizin.atualizar(); } catch (e) { console.error(e); }
        renderizarStatus();

        if (retiradaConcluida()) {
            finalizarRetirada();
        } else {
            mostrarAguardando();
        }

    } catch (err) {
        console.error(err);

        let mensagem;
        if (navigator.onLine === false || err.codigo === "rede") {
            mensagem = "Você está sem conexão com a internet. Verifique sua rede e tente novamente.";
        } else if (err.codigo === "conflito") {
            mensagem = "Esta locação não está mais na etapa de retirada. Atualize a página.";
        } else {
            mensagem = err.message || "Não foi possível enviar suas fotos. Tente novamente.";
        }

        mostrarToast(mensagem, "erro");
        btnEnviar.disabled = false;
        btnEnviar.innerHTML = `<i class="bi bi-check-circle"></i> Enviar Minhas Fotos`;
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

// Fecha o ciclo da retirada na tela. Quem muda o status da solicitação e
// notifica as partes é o back-end (quando a 2ª parte envia as fotos).
function finalizarRetirada() {
    clearInterval(intervaloAcompanhamento);
    fotosJaEnviadas = true;

    document.getElementById("etapa-enviar").style.display = "none";
    document.getElementById("etapa-aguardando").style.display = "none";
    document.getElementById("etapa-confirmada").style.display = "block";

    document.getElementById("confirmada-subtexto").textContent =
        "Você será redirecionado para acompanhar o andamento da locação.";

    setTimeout(() => {
        window.location.href = `/status-locacao?solicitacaoId=${encodeURIComponent(aluguelId)}`;
    }, 2000);
}

// Consulta o back a cada 5 s enquanto espera a outra parte (sem WebSocket).
function acompanharOutraParte() {
    clearInterval(intervaloAcompanhamento);

    intervaloAcompanhamento = setInterval(async () => {
        try {
            await Promise.all([RetiradaVizin.carregar(aluguelId), window.SolicitacoesVizin.atualizar()]);
        } catch (erro) {
            console.error("Não foi possível atualizar o status da retirada:", erro);
            return; // tenta de novo no próximo ciclo
        }

        if (verificarSeFoiCancelada()) return;
        renderizarStatus();
        if (retiradaConcluida()) {
            finalizarRetirada();
        }
    }, 5000);
}

// ================= ESTADO INICIAL =================
// Carrega o que já foi enviado (por mim ou pela outra parte). Se eu já enviei
// e reabri a página, pula direto pro estado de aguardando/confirmado.
try {
    await RetiradaVizin.carregar(aluguelId);
} catch (erro) {
    console.error("Não foi possível carregar o status da retirada:", erro);
    mostrarToast(erro.message || "Não foi possível carregar o status da retirada.", "erro");
}

renderizarStatus();

if (retiradaConcluida()) {
    finalizarRetirada();
} else if (RetiradaVizin.obterStatus(aluguelId)[meuPapel].enviado) {
    mostrarAguardando();
}

})();