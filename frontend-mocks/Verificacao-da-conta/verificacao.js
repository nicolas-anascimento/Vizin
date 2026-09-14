// ================= PROTEGER PÁGINA =================
if (!localStorage.getItem("token")) {
    sessionStorage.setItem("mensagemLogin", "Você precisa estar logado para verificar sua conta.");
    window.location.href = "../Login/index.html";
}
 
const usuarioSalvo = JSON.parse(localStorage.getItem("usuario") || "null") || {};
const emailUsuario = usuarioSalvo.email || "anonimo";
const CHAVE_VERIFICACAO = `vizin_verificacao_${emailUsuario}`;
 
// ================= ESTADO DE VERIFICAÇÃO =================
// status: "nao_verificado" | "em_analise" | "verificado" | "reprovado"
// Esta chave é a fonte da verdade sobre a verificação — Perfil/perfil.js
// lê o mesmo formato pra decidir o que mostrar no card de verificação e
// no selo "Verificado" ao lado do nome.
//
// PONTO DE INTEGRAÇÃO COM O BACK-END:
// Isso vira GET /api/usuarios/me/verificacao, e o envio dos documentos
// (mais abaixo) vira um POST multipart/form-data pra um endpoint que
// enfileira a análise (manual ou por um provedor de KYC de terceiro,
// tipo Idwall/CAF) — nunca faça essa checagem só no cliente de verdade.
function obterEstadoVerificacao() {
    return JSON.parse(localStorage.getItem(CHAVE_VERIFICACAO) || "null") || { status: "nao_verificado" };
}
 
function salvarEstadoVerificacao(estado) {
    localStorage.setItem(CHAVE_VERIFICACAO, JSON.stringify(estado));
 
    // Mantém "usuario.verificado" sincronizado por compatibilidade com
    // qualquer tela mais antiga que ainda leia esse booleano direto.
    const usuarioAtual = JSON.parse(localStorage.getItem("usuario") || "{}");
    localStorage.setItem("usuario", JSON.stringify({ ...usuarioAtual, verificado: estado.status === "verificado" }));
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
 
        const TAMANHO_MAXIMO_MB = 10;
        if (arquivo.size > TAMANHO_MAXIMO_MB * 1024 * 1024) {
            alert(`Esse arquivo é muito grande. O tamanho máximo é ${TAMANHO_MAXIMO_MB}MB.`);
            input.value = "";
            return;
        }
 
        arquivos[chave] = arquivo;
 
        caixa.style.display = "none";
        preview.style.display = "block";
 
        if (arquivo.type === "application/pdf") {
            previewImg.src = "../img/icone-pdf.png"; // placeholder — troque por um ícone real do projeto
        } else {
            previewImg.src = URL.createObjectURL(arquivo);
        }
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
        // PONTO DE INTEGRAÇÃO COM O BACK-END:
        // const formData = new FormData();
        // formData.append("documentoFrente", arquivos.frente);
        // formData.append("documentoVerso", arquivos.verso);
        // formData.append("selfie", arquivos.selfie);
        // await fetch("/api/usuarios/verificacao", { method: "POST", headers: {...}, body: formData });
 
        await new Promise(resolve => setTimeout(resolve, 900));
 
        salvarEstadoVerificacao({ status: "em_analise", enviadoEm: new Date().toISOString() });
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
 
// ================= SIMULAÇÃO DA ANÁLISE (SÓ PARA TESTES) =================
// TODO: remover estes dois botões quando existir uma análise de verdade
// (manual ou via provedor de KYC) do outro lado.
const MOTIVOS_REPROVACAO_TESTE = [
    "A foto do documento estava com o texto ilegível.",
    "O rosto na selfie não corresponde à foto do documento.",
    "O documento enviado está vencido."
];
 
document.getElementById("btn-simular-aprovacao").addEventListener("click", () => {
    salvarEstadoVerificacao({ status: "verificado", verificadoEm: new Date().toISOString() });
 
    if (window.NotificacoesVizin) {
        window.NotificacoesVizin.adicionarNotificacao({
            tipo: "aluguel_aprovado",
            titulo: "Conta verificada!",
            descricao: "Seus documentos foram aprovados. Sua conta agora exibe o selo de verificada.",
            data: new Date().toLocaleDateString("pt-BR")
        }, emailUsuario);
    }
 
    renderizarEstadoAtual();
});
 
document.getElementById("btn-simular-reprovacao").addEventListener("click", () => {
    const motivo = MOTIVOS_REPROVACAO_TESTE[Math.floor(Math.random() * MOTIVOS_REPROVACAO_TESTE.length)];
    salvarEstadoVerificacao({ status: "reprovado", motivoReprovacao: motivo });
 
    if (window.NotificacoesVizin) {
        window.NotificacoesVizin.adicionarNotificacao({
            tipo: "bloqueio_conta",
            titulo: "Não foi possível verificar sua conta",
            descricao: motivo,
            data: new Date().toLocaleDateString("pt-BR")
        }, emailUsuario);
    }
 
    // Limpa os arquivos da tentativa anterior — a pessoa precisa reenviar
    // fotos novas, não reenviar exatamente o que já foi recusado.
    arquivos.frente = arquivos.verso = arquivos.selfie = null;
 
    renderizarEstadoAtual();
});

// Chamada inicial: só acontece depois que todas as variáveis (etapaAtual,
// arquivos) e todos os listeners de botão já foram declarados acima.
renderizarEstadoAtual();
 