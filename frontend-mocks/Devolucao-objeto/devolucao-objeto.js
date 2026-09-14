// ================= PROTEGER PÁGINA =================
if (!localStorage.getItem("token")) {
    window.location.href = "../Login/index.html";
}

// ================= USUÁRIO LOGADO =================
const usuarioLogado = JSON.parse(localStorage.getItem("usuario") || "null");

// ================= LER DADOS DA URL =================
const params = new URLSearchParams(window.location.search);
const produtoIdUrl = params.get("produtoId") || "1";
const solicitacaoIdParam = params.get("solicitacaoId");

document.getElementById("link-voltar").addEventListener("click", (e) => {
    e.preventDefault();
    window.location.href = `../Status-locacao/index.html?solicitacaoId=${solicitacaoIdParam || ""}`;
});

document.getElementById("btn-cancelar").addEventListener("click", () => {
    window.location.href = `../Status-locacao/index.html?solicitacaoId=${solicitacaoIdParam || ""}`;
});

// ================= DADOS DA SOLICITAÇÃO / PRODUTO =================
// PONTO DE INTEGRAÇÃO COM O BACK-END:
// Buscar via GET /api/pedidos/:solicitacaoId, igual à página de Retirada.
const solicitacao = (solicitacaoIdParam && window.SolicitacoesVizin)
    ? window.SolicitacoesVizin.obterPorId(Number(solicitacaoIdParam))
    : null;

const aluguelId = solicitacao ? solicitacao.id : (solicitacaoIdParam || produtoIdUrl);

const produto = {
    id: solicitacao ? solicitacao.produtoId : produtoIdUrl,
    titulo: solicitacao ? solicitacao.produtoTitulo : "Furadeira Profissional Bosch",
    categoria: solicitacao ? (solicitacao.categoriaProduto || "Ferramentas") : "Ferramentas",
    imagem: (solicitacao && solicitacao.imagemProduto) || "../img/sem-imagem.jpg",
    proprietario: {
        nome: (solicitacao && solicitacao.proprietarioNome) || "Maria Santos",
        email: (solicitacao && solicitacao.proprietarioEmail) || "maria@vizin.com"
    }
};

document.getElementById("produto-mini-imagem").src = produto.imagem;
document.getElementById("produto-mini-nome").textContent = produto.titulo;
document.getElementById("produto-mini-categoria").textContent = produto.categoria;
document.getElementById("produto-mini-proprietario").textContent = produto.proprietario.nome;
document.getElementById("btn-ver-status").href = `../Status-locacao/index.html?solicitacaoId=${aluguelId}`;

// ================= DESCOBRIR O PAPEL DE QUEM ESTÁ LOGADO =================
// ================= [SÓ PARA TESTES] TOGGLE DE PAPEL =================
// TODO: remover quando integrar com o back-end real. Lê o mesmo override
// definido na página Status-locacao, pra manter o papel escolhido ao
// navegar entre as telas do fluxo.
const CHAVE_SIM_PAPEL = "vizin_sim_papel_override";

function papelReal() {
    return (usuarioLogado?.email === produto.proprietario.email) ? "proprietario" : "locatario";
}

const meuPapel = sessionStorage.getItem(CHAVE_SIM_PAPEL) || papelReal();
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

const togglePapelEls = document.querySelectorAll(".sim-papel-btn");
togglePapelEls.forEach(btn => {
    btn.classList.toggle("ativo", btn.dataset.papel === meuPapel);
    btn.addEventListener("click", () => {
        sessionStorage.setItem(CHAVE_SIM_PAPEL, btn.dataset.papel);
        location.reload();
    });
});

// ================= COMPRESSÃO DE FOTOS PRA BASE64 =================
// PONTO DE INTEGRAÇÃO COM O BACK-END:
// Mesmo motivo do retirada-objeto.js: comprimimos as fotos só pra caberem no
// localStorage (via DevolucaoVizin) e aparecerem depois no Histórico. Em
// produção, envie os arquivos originais pro back-end e use as URLs devolvidas.
function comprimirImagem(arquivo, larguraMax = 480, qualidade = 0.65) {
    return new Promise((resolve, reject) => {
        const leitor = new FileReader();
        leitor.onload = (e) => {
            const img = new Image();
            img.onload = () => {
                const escala = Math.min(1, larguraMax / img.width);
                const canvas = document.createElement("canvas");
                canvas.width = img.width * escala;
                canvas.height = img.height * escala;
                canvas.getContext("2d").drawImage(img, 0, 0, canvas.width, canvas.height);
                resolve(canvas.toDataURL("image/jpeg", qualidade));
            };
            img.onerror = reject;
            img.src = e.target.result;
        };
        leitor.onerror = reject;
        leitor.readAsDataURL(arquivo);
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

    arquivos.slice(0, espacoRestante).forEach(arquivo => {
        if (!arquivo.type.startsWith("image/")) return;
        minhasFotos.push(arquivo);
    });

    renderizarFotos();
}

function renderizarFotos() {
    fotosGrid.innerHTML = "";

    minhasFotos.forEach((arquivo, index) => {
        const slot = document.createElement("div");
        slot.className = "parte-foto-slot";

        const img = document.createElement("img");
        img.src = URL.createObjectURL(arquivo);
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

// ================= STATUS DA OUTRA PARTE =================
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
        texto.innerHTML = `${nomesPapel[papel]}${souEu ? " (você)" : ""}
            <span class="status-linha-sub">${dados.enviado ? `${dados.quantidade} foto(s) enviada(s)` : "Ainda não enviou as fotos"}</span>`;

        linha.appendChild(icone);
        linha.appendChild(texto);
        statusLista.appendChild(linha);
    });

    return status;
}

renderizarStatus();

(function retomarEstadoSeExistir() {
    const status = DevolucaoVizin.obterStatus(aluguelId);
    if (status[meuPapel].enviado) {
        if (DevolucaoVizin.ambosConcluidos(aluguelId)) {
            finalizarDevolucao();
        } else {
            mostrarAguardando();
        }
    }
})();

// ================= ENVIAR MINHAS FOTOS =================
btnEnviar.addEventListener("click", async () => {
    if (minhasFotos.length === 0) return;

    btnEnviar.disabled = true;
    btnEnviar.innerHTML = `<span class="spinner"></span> Enviando...`;

    const observacoes = document.getElementById("observacoes").value.trim();

    try {
        // PONTO DE INTEGRAÇÃO COM O BACK-END:
        // Mesmo padrão da Retirada: POST /api/devolucoes/fotos (multipart),
        // com aluguel_id, papel, observações e as fotos.

        const fotosBase64 = await comprimirFotos(minhasFotos);

        await new Promise(resolve => setTimeout(resolve, 1000)); // simula envio

        DevolucaoVizin.enviarFotos(aluguelId, meuPapel, minhasFotos.length, observacoes, fotosBase64);

        if (DevolucaoVizin.ambosConcluidos(aluguelId)) {
            finalizarDevolucao();
        } else {
            mostrarAguardando();
        }

    } catch (err) {
        console.error(err);
        alert("Não foi possível enviar suas fotos. Tente novamente.");
        btnEnviar.disabled = false;
        btnEnviar.innerHTML = `<i class="bi bi-check-circle"></i> Confirmar Devolução`;
    }
});

// ================= TROCA DE ESTADOS =================
let intervaloAcompanhamento = null;

function mostrarAguardando() {
    document.getElementById("etapa-enviar").style.display = "none";
    document.getElementById("etapa-aguardando").style.display = "block";
    document.getElementById("etapa-confirmada").style.display = "none";

    document.getElementById("aguardando-texto").textContent =
        `Aguardando o envio das fotos de ${nomesPapel[papelDaOutraParte].toLowerCase()}.`;

    // Diferente da Retirada, aqui não existe botão de cancelar (a locação já
    // está em andamento — o objeto está fisicamente com o locatário). Se a
    // outra parte simplesmente não enviar as fotos dela, hoje não havia
    // nenhuma saída visível pra quem está esperando — só esse link pro
    // Suporte.
    const linkSuporte = document.getElementById("link-suporte-aguardando");
    if (linkSuporte) {
        linkSuporte.href = `../Suporte/index.html?solicitacaoId=${aluguelId}`;
    }

    acompanharOutraParte();
}

function finalizarDevolucao() {
    clearInterval(intervaloAcompanhamento);

    if (solicitacao && window.SolicitacoesVizin && solicitacao.status !== "concluido") {
        window.SolicitacoesVizin.atualizarStatus(solicitacao.id, "concluido");

        // A locação terminou — o objeto volta a ficar disponível pra outras
        // pessoas solicitarem.
        if (window.ObjetosVizin) {
            window.ObjetosVizin.marcarDisponibilidade(solicitacao.produtoId, true);
        }

        if (window.NotificacoesVizin) {
            window.NotificacoesVizin.adicionarNotificacao({
                tipo: "devolucao_confirmada",
                titulo: "Devolução confirmada",
                descricao: `A devolução de "${produto.titulo}" foi confirmada. O aluguel foi concluído.`,
                data: new Date().toLocaleDateString("pt-BR"),
                solicitacaoId: solicitacao.id
            }, solicitacao.solicitanteEmail);

            window.NotificacoesVizin.adicionarNotificacao({
                tipo: "devolucao_confirmada",
                titulo: "Objeto devolvido",
                descricao: `${solicitacao.solicitanteNome || "O locatário"} devolveu "${produto.titulo}". Você já pode avaliar a transação.`,
                data: new Date().toLocaleDateString("pt-BR"),
                solicitacaoId: solicitacao.id
            }, solicitacao.proprietarioEmail);
        }
    }

    document.getElementById("etapa-enviar").style.display = "none";
    document.getElementById("etapa-aguardando").style.display = "none";
    document.getElementById("etapa-confirmada").style.display = "block";
}
// PONTO DE INTEGRAÇÃO COM O BACK-END:
// Trocar por WebSocket, ou por um GET periódico em /api/devolucoes/:aluguelId/status.
function acompanharOutraParte() {
    clearInterval(intervaloAcompanhamento);

    intervaloAcompanhamento = setInterval(() => {
        renderizarStatus();
        if (DevolucaoVizin.ambosConcluidos(aluguelId)) {
            finalizarDevolucao();
        }
    }, 1000);
}

// ================= [SÓ PARA TESTES] SIMULAR A OUTRA PARTE =================
// TODO: remover este bloco inteiro quando integrar com o back-end real.
// Mesmo motivo do retirada-objeto.js: testando sozinho com mocks em
// localStorage, as duas "pessoas" precisariam estar em sessões/navegadores
// diferentes pra esse fluxo avançar de verdade.
const btnSimularOutraParte = document.getElementById("btn-simular-outra-parte");
if (btnSimularOutraParte) {
    btnSimularOutraParte.addEventListener("click", () => {
        // Não existe arquivo real pra comprimir aqui (é só simulação), então
        // usamos fotos de rosto genérico de um serviço público só pra dar
        // pra visualizar o card do Histórico preenchido de ponta a ponta.
        const fotosSimuladas = [
            `https://i.pravatar.cc/150?u=${aluguelId}-devolucao-${papelDaOutraParte}-1`,
            `https://i.pravatar.cc/150?u=${aluguelId}-devolucao-${papelDaOutraParte}-2`
        ];
        DevolucaoVizin.enviarFotos(aluguelId, papelDaOutraParte, 2, "Fotos simuladas para teste", fotosSimuladas);
        const status = renderizarStatus();
        if (DevolucaoVizin.ambosConcluidos(aluguelId)) {
            finalizarDevolucao();
        }
    });
}
