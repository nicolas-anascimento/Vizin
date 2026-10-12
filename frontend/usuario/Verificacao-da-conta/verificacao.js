// Status somente do servidor; o cache dura apenas até a próxima consulta.
let estadoVerificacao = { status: "nao_verificado" };
function obterEstadoVerificacao() { return estadoVerificacao; }
function salvarEstadoVerificacao(dto) {
    estadoVerificacao = {
        status: ({nao_enviado:"nao_verificado", pendente:"em_analise", aprovado:"verificado", rejeitado:"reprovado"})[dto.status] || "nao_verificado",
        enviadoEm: dto.criado_em,
        motivoReprovacao: dto.motivo || null
    };
}

// Link pro Suporte já com assunto/mensagem preenchidos (suporte.js aceita ?assunto=&mensagem=).
function linkSuporteVerificacao(mensagem) {
    const q = new URLSearchParams({ assunto: "Verificação de conta", mensagem });
    return `/suporte?${q.toString()}`;
}

// ================= TELAS =================
const telas = {
    jaVerificado: document.getElementById("tela-ja-verificado"),
    emAnalise: document.getElementById("tela-em-analise"),
    formulario: document.getElementById("tela-formulario")
};
 
function mostrarTela(nome) {
    Object.values(telas).forEach(el => el && (el.style.display = "none"));
    if (telas[nome]) telas[nome].style.display = "block";
}
 
function renderizarEstadoAtual() {
    const estado = obterEstadoVerificacao();
 
    if (estado.status === "verificado") {
        mostrarTela("jaVerificado");
        return;
    }
 
    if (estado.status === "em_analise") {
        mostrarTela("emAnalise");
        const dataEnvio = estado.enviadoEm ? new Date(estado.enviadoEm) : null;
        document.getElementById("texto-enviado-em").textContent = dataEnvio
            ? `Enviado em ${dataEnvio.toLocaleDateString("pt-BR")} às ${dataEnvio.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}`
            : "";
        return;
    }
 
    // "nao_verificado" e "reprovado" caem no mesmo formulário — a única
    // diferença é o aviso de motivo no topo.
    mostrarTela("formulario");
    const avisoReprovado = document.getElementById("aviso-reprovado");
    if (estado.status === "reprovado") {
        avisoReprovado.style.display = "block";
        document.getElementById("texto-motivo-reprovacao").textContent =
            estado.motivoReprovacao || "As fotos enviadas não estavam legíveis o suficiente para confirmar seus dados.";
        document.getElementById("link-suporte-reprovado").href =
            linkSuporteVerificacao("Minha verificação de conta foi reprovada e gostaria de ajuda.");
    } else {
        avisoReprovado.style.display = "none";
    }
    irParaEtapa(1);
}
 
// ================= TIPO DE DOCUMENTO =================
// RG e CNH têm frente e verso; passaporte tem uma página só (pula a etapa 2).
let tipoDocumento = "rg";
const semVerso = () => tipoDocumento === "passaporte";

document.querySelectorAll('input[name="tipo-documento"]').forEach(radio => {
    radio.addEventListener("change", () => {
        tipoDocumento = radio.value;
        document.getElementById("aviso-passaporte").style.display = semVerso() ? "block" : "none";
        document.getElementById("subtitulo-frente").textContent = semVerso()
            ? "A página com sua foto e seus dados."
            : "O lado com sua foto e seus dados.";
        atualizarPontos();
    });
});

// ================= NAVEGAÇÃO ENTRE ETAPAS =================
let etapaAtual = 1;
const arquivos = { frente: null, verso: null, selfie: null };
const urlsPreview = { frente: null, verso: null, selfie: null };

function atualizarPontos() {
    document.querySelectorAll("[data-step-dot]").forEach(dot => {
        const n = Number(dot.dataset.stepDot);
        dot.style.display = (n === 2 && semVerso()) ? "none" : "";
        dot.classList.toggle("ativo", n === etapaAtual);
        dot.classList.toggle("concluido", n < etapaAtual);
    });
}

function irParaEtapa(numero) {
    etapaAtual = numero;
    document.querySelectorAll(".verif-etapa").forEach(el => {
        el.style.display = Number(el.dataset.etapa) === numero ? "block" : "none";
    });
    atualizarPontos();
}

// ================= MENSAGENS POR ETAPA (no lugar de alert) =================
const MENSAGENS = { frente: "mensagem-etapa1", verso: "mensagem-etapa2", selfie: "mensagem-envio" };

function mostrarMensagem(chave, texto, tipo) {
    const el = document.getElementById(MENSAGENS[chave]);
    el.textContent = texto || "";
    el.className = "conta-mensagem" + (tipo === "erro" ? " erro" : "");
}

function mostrarMensagemComSuporte(chave, texto, mensagemSuporte) {
    const el = document.getElementById(MENSAGENS[chave]);
    el.className = "conta-mensagem erro";
    el.textContent = `${texto} `;
    const a = document.createElement("a");
    a.href = linkSuporteVerificacao(mensagemSuporte);
    a.textContent = "Fale com o Suporte";
    el.appendChild(a);
}

// ================= PREPARO DA IMAGEM =================
// Fotos de celular costumam passar de 5 MB e iPhone manda HEIC. Antes de
// aceitar, redimensiona e converte pra JPEG no próprio navegador. Imagens
// já pequenas e em formato aceito passam direto.
const TIPOS_ACEITOS = /^image\/(jpeg|png|webp|gif)$/;
const TAMANHO_MAXIMO_BYTES = 5 * 1024 * 1024;
const REDUZIR_ACIMA_DE_BYTES = 1.5 * 1024 * 1024;
const LADO_MAXIMO_PX = 2000;
const QUALIDADES_JPEG = [0.88, 0.76, 0.64, 0.5];

function eHeic(arquivo) {
    return /^image\/(heic|heif)$/i.test(arquivo.type) || /\.(heic|heif)$/i.test(arquivo.name || "");
}

async function carregarImagem(arquivo) {
    if ("createImageBitmap" in window) {
        try { return await createImageBitmap(arquivo); } catch (_) { /* tenta pelo <img> */ }
    }
    return new Promise((resolve, reject) => {
        const url = URL.createObjectURL(arquivo);
        const img = new Image();
        img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
        img.onerror = () => { URL.revokeObjectURL(url); reject(new Error("decode")); };
        img.src = url;
    });
}

async function prepararImagem(arquivo) {
    const heic = eHeic(arquivo);
    const formatoAceito = TIPOS_ACEITOS.test(arquivo.type);

    if (!formatoAceito && !heic && !arquivo.type.startsWith("image/")) {
        throw new Error("Envie uma imagem (JPG, PNG, WebP ou HEIC).");
    }
    if (formatoAceito && arquivo.size <= REDUZIR_ACIMA_DE_BYTES) return arquivo;

    let origem;
    try {
        origem = await carregarImagem(arquivo);
    } catch (_) {
        if (formatoAceito && arquivo.size <= TAMANHO_MAXIMO_BYTES) return arquivo;
        throw new Error(heic
            ? "Seu navegador não consegue abrir fotos HEIC. Tire a foto de novo pelo botão da câmera ou envie em JPG ou PNG."
            : "Não foi possível ler essa imagem. Tente outra foto.");
    }

    const escala = Math.min(1, LADO_MAXIMO_PX / Math.max(origem.width, origem.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(origem.width * escala);
    canvas.height = Math.round(origem.height * escala);
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = "#fff"; // PNG com transparência não vira fundo preto no JPEG
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(origem, 0, 0, canvas.width, canvas.height);
    if (typeof origem.close === "function") origem.close();

    for (const qualidade of QUALIDADES_JPEG) {
        const blob = await new Promise(resolve => canvas.toBlob(resolve, "image/jpeg", qualidade));
        if (blob && blob.size <= TAMANHO_MAXIMO_BYTES) {
            const nome = (arquivo.name || "foto").replace(/\.[^.]+$/, "") + ".jpg";
            return new File([blob], nome, { type: "image/jpeg" });
        }
    }
    throw new Error("A foto continuou grande demais mesmo reduzida. Tente tirar outra.");
}

// ================= UPLOAD + PREVIEW (genérico pras 3 etapas) =================
function ligarUpload(chave, inputId, caixaId, previewId, previewImgId) {
    const input = document.getElementById(inputId);
    const caixa = document.getElementById(caixaId);
    const preview = document.getElementById(previewId);
    const previewImg = document.getElementById(previewImgId);

    input.addEventListener("change", async () => {
        const original = input.files[0];
        if (!original) return;

        mostrarMensagem(chave, "Preparando a foto...");
        let arquivo;
        try {
            arquivo = await prepararImagem(original);
        } catch (err) {
            mostrarMensagem(chave, err.message, "erro");
            input.value = "";
            return;
        }
        mostrarMensagem(chave, "");

        // Libera a object URL da foto anterior antes de criar uma nova,
        // pra não acumular URLs órfãs se a pessoa trocar a foto várias vezes.
        if (urlsPreview[chave]) {
            URL.revokeObjectURL(urlsPreview[chave]);
            urlsPreview[chave] = null;
        }

        arquivos[chave] = arquivo;
        caixa.style.display = "none";
        preview.style.display = "block";

        const url = URL.createObjectURL(arquivo);
        urlsPreview[chave] = url;
        previewImg.style.display = "block";
        previewImg.src = url;
    });

    preview.querySelector(`[data-trocar="${chave}"]`).addEventListener("click", () => {
        input.click();
    });
}

ligarUpload("frente", "input-doc-frente", "caixa-upload-frente", "preview-frente", "preview-frente-img");
ligarUpload("verso", "input-doc-verso", "caixa-upload-verso", "preview-verso", "preview-verso-img");
ligarUpload("selfie", "input-selfie", "caixa-upload-selfie", "preview-selfie", "preview-selfie-img");

// Limpa tudo (usado depois de cancelar um envio em análise).
function resetarFormulario() {
    ["frente", "verso", "selfie"].forEach(chave => {
        if (urlsPreview[chave]) URL.revokeObjectURL(urlsPreview[chave]);
        urlsPreview[chave] = null;
        arquivos[chave] = null;
        mostrarMensagem(chave, "");
    });
    [["input-doc-frente", "caixa-upload-frente", "preview-frente"],
     ["input-doc-verso", "caixa-upload-verso", "preview-verso"],
     ["input-selfie", "caixa-upload-selfie", "preview-selfie"]].forEach(([inp, caixa, prev]) => {
        document.getElementById(inp).value = "";
        document.getElementById(caixa).style.display = "";
        document.getElementById(prev).style.display = "none";
    });
    document.getElementById("checkbox-confirmar-dados").checked = false;
}
 
document.getElementById("btn-etapa1-proximo").addEventListener("click", () => {
    if (!arquivos.frente) {
        mostrarMensagem("frente", "Envie uma foto da frente do documento para continuar.", "erro");
        return;
    }
    // Passaporte não tem verso: vai direto pra selfie.
    irParaEtapa(semVerso() ? 3 : 2);
});
 
document.getElementById("btn-etapa2-voltar").addEventListener("click", () => irParaEtapa(1));
 
document.getElementById("btn-etapa2-proximo").addEventListener("click", () => {
    if (!arquivos.verso) {
        mostrarMensagem("verso", "Envie uma foto do verso do documento para continuar.", "erro");
        return;
    }
    irParaEtapa(3);
});
 
document.getElementById("btn-etapa3-voltar").addEventListener("click", () => irParaEtapa(semVerso() ? 1 : 2));
 
// ================= ENVIAR PARA ANÁLISE =================
const mensagemEnvioEl = document.getElementById("mensagem-envio");

async function recarregarEstado() {
    const dto = await window.ApiVizin.get("/usuarios/me/verificacao");
    salvarEstadoVerificacao(dto);
    renderizarEstadoAtual();
}
 
document.getElementById("btn-enviar-verificacao").addEventListener("click", async () => {
    mostrarMensagem("selfie", "");
 
    if (!arquivos.frente) {
        irParaEtapa(1);
        mostrarMensagem("frente", "Envie uma foto da frente do documento para continuar.", "erro");
        return;
    }
    if (!semVerso() && !arquivos.verso) {
        irParaEtapa(2);
        mostrarMensagem("verso", "Envie uma foto do verso do documento para continuar.", "erro");
        return;
    }
    if (!arquivos.selfie) {
        mostrarMensagem("selfie", "Envie a selfie com o documento para continuar.", "erro");
        return;
    }
    if (!document.getElementById("checkbox-confirmar-dados").checked) {
        mostrarMensagem("selfie", "Confirme que o documento é seu para enviar.", "erro");
        return;
    }
 
    const btnEnviar = document.getElementById("btn-enviar-verificacao");
    btnEnviar.disabled = true;
    btnEnviar.textContent = "Enviando...";
 
    try {
        const formData = new FormData();
        formData.append("tipo_documento", tipoDocumento);
        formData.append("documentoFrente", arquivos.frente);
        if (!semVerso()) formData.append("documentoVerso", arquivos.verso);
        formData.append("selfie", arquivos.selfie);
        const resposta = await window.ApiVizin.post("/usuarios/verificacao", formData);
        salvarEstadoVerificacao(resposta);
        renderizarEstadoAtual();
 
    } catch (err) {
        console.error(err);
        if (err.status === 409) {
            // Já existe um envio em análise (ou a conta já foi verificada): mostra o estado real.
            try { await recarregarEstado(); return; } catch (_) { /* cai na mensagem abaixo */ }
        }
        if (err.status === 429 || err.codigo === "limite_tentativas") {
            mostrarMensagemComSuporte("selfie",
                "Você atingiu o limite de tentativas por enquanto.",
                "Atingi o limite de tentativas de verificação de conta e preciso de ajuda.");
        } else if (err.status === 413) {
            mostrarMensagem("selfie", "Alguma das fotos ficou grande demais. Troque por uma menor e tente de novo.", "erro");
        } else if (err.status >= 400 && err.status < 500 && err.message) {
            mostrarMensagem("selfie", err.message, "erro");
        } else {
            mostrarMensagem("selfie", "Não foi possível enviar seus documentos. Tente novamente.", "erro");
        }
    } finally {
        btnEnviar.disabled = false;
        btnEnviar.textContent = "Enviar para análise";
    }
});

// ================= CANCELAR ENVIO EM ANÁLISE =================
// Útil quando a pessoa percebe que mandou o documento errado e não quer
// esperar até 48 h pra uma reprovação. O back descarta o envio pendente.
const modalCancelar = document.getElementById("modal-cancelar-envio");
const mensagemCancelarEl = document.getElementById("mensagem-cancelar");
const btnCancelarConfirmar = document.getElementById("modal-cancelar-envio-confirmar");

function fecharModalCancelar() { modalCancelar.classList.remove("show"); }

document.getElementById("btn-cancelar-envio").addEventListener("click", () => {
    mensagemCancelarEl.textContent = "";
    mensagemCancelarEl.className = "conta-mensagem";
    modalCancelar.classList.add("show");
});
document.getElementById("modal-cancelar-envio-voltar").addEventListener("click", fecharModalCancelar);
modalCancelar.addEventListener("click", (e) => { if (e.target === modalCancelar) fecharModalCancelar(); });

btnCancelarConfirmar.addEventListener("click", async () => {
    btnCancelarConfirmar.disabled = true;
    mensagemCancelarEl.textContent = "";
    try {
        await window.ApiVizin.delete("/usuarios/verificacao");
        fecharModalCancelar();
        estadoVerificacao = { status: "nao_verificado" };
        resetarFormulario();
        renderizarEstadoAtual();
    } catch (err) {
        console.error(err);
        if (err.status === 409) {
            // Já foi analisada enquanto a pessoa decidia: mostra o resultado real.
            fecharModalCancelar();
            try { await recarregarEstado(); return; } catch (_) { /* segue pra mensagem */ }
        }
        mensagemCancelarEl.className = "conta-mensagem erro";
        mensagemCancelarEl.textContent = "Não foi possível cancelar o envio. Tente novamente.";
    } finally {
        btnCancelarConfirmar.disabled = false;
    }
});
 
// A análise e o selo de verificação são definidos no servidor.
window.ApiVizin.get("/usuarios/me/verificacao")
    .then(dto => { salvarEstadoVerificacao(dto); renderizarEstadoAtual(); })
    .catch(err => { console.error(err); mensagemEnvioEl.textContent = "Não foi possível consultar a verificação."; });