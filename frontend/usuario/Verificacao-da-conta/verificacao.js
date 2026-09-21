// ================= PROTEGER PÁGINA =================
if (!localStorage.getItem("token")) {
    sessionStorage.setItem("mensagemLogin", "Você precisa estar logado para verificar sua conta.");
    window.location.href = "/login";
    throw new Error("Redirecionando para login: usuário não autenticado.");
}
 
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
    } else {
        avisoReprovado.style.display = "none";
    }
    irParaEtapa(1);
}
 
 
// ================= NAVEGAÇÃO ENTRE ETAPAS =================
const totalEtapas = 3;
let etapaAtual = 1;
const arquivos = { frente: null, verso: null, selfie: null };
const urlsPreview = { frente: null, verso: null, selfie: null };
 
function irParaEtapa(numero) {
    etapaAtual = numero;
    document.querySelectorAll(".verif-etapa").forEach(el => {
        el.style.display = Number(el.dataset.etapa) === numero ? "block" : "none";
    });
    document.querySelectorAll("[data-step-dot]").forEach(dot => {
        const n = Number(dot.dataset.stepDot);
        dot.classList.toggle("ativo", n === numero);
        dot.classList.toggle("concluido", n < numero);
    });
}
 
// ================= UPLOAD + PREVIEW (genérico pras 3 etapas) =================
function ligarUpload(chave, inputId, caixaId, previewId, previewImgId) {
    const input = document.getElementById(inputId);
    const caixa = document.getElementById(caixaId);
    const preview = document.getElementById(previewId);
    const previewImg = document.getElementById(previewImgId);
    input.addEventListener("change", () => {
        const arquivo = input.files[0];
        if (!arquivo) return;
 
        const TAMANHO_MAXIMO_MB = 5;
        if (!/^image\/(jpeg|png|webp|gif)$/.test(arquivo.type) || arquivo.size > TAMANHO_MAXIMO_MB * 1024 * 1024) {
            alert(`Envie uma imagem JPG, PNG, WebP ou GIF de até ${TAMANHO_MAXIMO_MB} MB.`);
            input.value = "";
            return;
        }
 
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
 
document.getElementById("btn-etapa1-proximo").addEventListener("click", () => {
    if (!arquivos.frente) {
        alert("Envie uma foto da frente do documento para continuar.");
        return;
    }
    irParaEtapa(2);
});
 
document.getElementById("btn-etapa2-voltar").addEventListener("click", () => irParaEtapa(1));
 
document.getElementById("btn-etapa2-proximo").addEventListener("click", () => {
    if (!arquivos.verso) {
        alert("Envie uma foto do verso do documento para continuar.");
        return;
    }
    irParaEtapa(3);
});
 
document.getElementById("btn-etapa3-voltar").addEventListener("click", () => irParaEtapa(2));
 
// ================= ENVIAR PARA ANÁLISE =================
const mensagemEnvioEl = document.getElementById("mensagem-envio");
 
document.getElementById("btn-enviar-verificacao").addEventListener("click", async () => {
    mensagemEnvioEl.textContent = "";
    mensagemEnvioEl.className = "conta-mensagem";
 
    if (!arquivos.selfie) {
        mensagemEnvioEl.textContent = "Envie a selfie com o documento para continuar.";
        mensagemEnvioEl.classList.add("erro");
        return;
    }
    if (!document.getElementById("checkbox-confirmar-dados").checked) {
        mensagemEnvioEl.textContent = "Confirme que o documento é seu para enviar.";
        mensagemEnvioEl.classList.add("erro");
        return;
    }
 
    const btnEnviar = document.getElementById("btn-enviar-verificacao");
    btnEnviar.disabled = true;
    btnEnviar.textContent = "Enviando...";
 
    try {
        const formData = new FormData();
        formData.append("documentoFrente", arquivos.frente);
        formData.append("documentoVerso", arquivos.verso);
        formData.append("selfie", arquivos.selfie);
        const resposta = await window.ApiVizin.post("/usuarios/verificacao", formData);
        salvarEstadoVerificacao(resposta);
        renderizarEstadoAtual();
 
    } catch (err) {
        console.error(err);
        mensagemEnvioEl.textContent = "Não foi possível enviar seus documentos. Tente novamente.";
        mensagemEnvioEl.classList.add("erro");
    } finally {
        btnEnviar.disabled = false;
        btnEnviar.textContent = "Enviar para análise";
    }
});
 
// A análise e o selo de verificação são definidos no servidor.
window.ApiVizin.get("/usuarios/me/verificacao")
    .then(dto => { salvarEstadoVerificacao(dto); renderizarEstadoAtual(); })
    .catch(err => { console.error(err); mensagemEnvioEl.textContent = "Não foi possível consultar a verificação."; });
