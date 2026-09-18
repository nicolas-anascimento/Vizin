// ================= PROTEGER PÁGINA =================
if (!localStorage.getItem("token")) {
    window.location.href = "../Login/index.html";
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
 
// ================= SOLICITAÇÃO NÃO ENCONTRADA =================
// Antes disso, um link com solicitacaoId inválido/expirado caía
// silenciosamente no mock "Furadeira Profissional Bosch". Só cai nesse
// estado quando um id foi passado na URL e não foi encontrado.
const paginaEncontrada = !(solicitacaoIdParam && !solicitacao);
if (!paginaEncontrada) {
    document.getElementById("conteudo-devolucao").style.display = "none";
    document.getElementById("sim-papel-toggle").style.display = "none";
    document.getElementById("etapa-erro").style.display = "block";
}

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

// ================= ACESSO NEGADO =================
// Sem isso, qualquer usuário logado que abrisse o link de OUTRA pessoa
// virava "locatário" automaticamente e conseguia enviar fotos como se
// fizesse parte da locação. O toggle de simulação continua liberado.
if (paginaEncontrada && solicitacao && !sessionStorage.getItem(CHAVE_SIM_PAPEL)) {
    const souParteDaLocacao = usuarioLogado?.email === solicitacao.solicitanteEmail
        || usuarioLogado?.email === solicitacao.proprietarioEmail;

    if (!souParteDaLocacao) {
        document.getElementById("conteudo-devolucao").style.display = "none";
        document.getElementById("sim-papel-toggle").style.display = "none";
        document.getElementById("etapa-acesso-negado").style.display = "block";
    }
}

// ================= PRAZO / ATRASO DA DEVOLUÇÃO (visível na própria tela) =================
// Antes disso a pessoa só descobria que estava atrasada olhando o card no
// Histórico. Mesma lógica de parse de data usada em solicitacoes-shared.js.
function parseDataISOLocal(dataStr) {
    if (!dataStr) return null;
    const partes = dataStr.split("-").map(Number);
    if (partes.length !== 3 || partes.some(Number.isNaN)) return null;
    const [ano, mes, dia] = partes;
    return new Date(ano, mes - 1, dia);
}

(function mostrarPrazo() {
    if (!solicitacao || !solicitacao.dataDevolucao) return;
    if (!["retirado", "aguardando_devolucao"].includes(solicitacao.status)) return;

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
        const multa = window.SolicitacoesVizin?.calcularMulta
            ? window.SolicitacoesVizin.calcularMulta(solicitacao)
            : { diasAtraso: Math.abs(diffDias), valorTotal: null };
        const valorFormatado = window.SolicitacoesVizin?.formatarReal && multa.valorTotal !== null
            ? window.SolicitacoesVizin.formatarReal(multa.valorTotal)
            : null;

        const parteMulta = valorFormatado
            ? ` Já acumulou ${valorFormatado} de multa (R$ 2,00/dia), cobrados quando a devolução for confirmada.`
            : "";

        texto = `Devolução em atraso há ${multa.diasAtraso} dia(s) (prazo era ${dataFormatada}). Enquanto o objeto não for devolvido, ${meuPapel === "locatario" ? "sua conta fica impedida de solicitar novos aluguéis ou aprovar locações" : "a conta de quem alugou fica restrita"}.${parteMulta}`;
        prazoCard.classList.add("prazo-urgente");
    }

    prazoTexto.textContent = texto;
    prazoCard.style.display = "flex";
})();

// ================= RESUMO DA MULTA ANTES DE CONFIRMAR =================
// O card de prazo acima já avisa que existe atraso, mas o valor fica
// "diluído" no meio do texto. Aqui repetimos o valor exato, perto do botão
// de confirmar, com um resumo direto — pra ninguém confirmar a devolução
// sem saber exatamente quanto vai ser cobrado (ou recebido) na hora.
(function mostrarResumoMultaAntesConfirmar() {
    const resumoEl = document.getElementById("resumo-multa-confirmar");
    if (!resumoEl || !solicitacao || !window.SolicitacoesVizin) return;
    if (!["retirado", "aguardando_devolucao"].includes(solicitacao.status)) return;

    const multa = window.SolicitacoesVizin.calcularMulta(solicitacao);
    if (multa.diasAtraso <= 0) return;

    const formatar = window.SolicitacoesVizin.formatarReal;
    const textoValor = meuPapel === "locatario"
        ? `<strong>${formatar(multa.valorTotal)} será cobrado agora</strong> ao confirmar a devolução`
        : `<strong>${formatar(multa.valorProprietario)} será creditado a você</strong> ao confirmar a devolução`;

    resumoEl.innerHTML = `
        <i class="bi bi-receipt"></i>
        <span>${textoValor} — ${multa.diasAtraso} dia(s) de atraso (${formatar(window.SolicitacoesVizin.MULTA_POR_DIA_ATRASO)}/dia).</span>
    `;
    resumoEl.classList.add("prazo-urgente");
    resumoEl.style.display = "flex";
})();

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
let fotosJaEnviadas = false;
window.addEventListener("beforeunload", (e) => {
    if (minhasFotos.length > 0 && !fotosJaEnviadas) {
        e.preventDefault();
        e.returnValue = "";
    }
});
 
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
        fotosJaEnviadas = true;

        if (DevolucaoVizin.ambosConcluidos(aluguelId)) {
            finalizarDevolucao();
        } else {
            mostrarAguardando();
        }

    } catch (err) {
        console.error(err);
        const mensagem = navigator.onLine === false
            ? "Você está sem conexão com a internet. Verifique sua rede e tente novamente."
            : "Não foi possível enviar suas fotos. Tente novamente.";
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

function finalizarDevolucao() {
    clearInterval(intervaloAcompanhamento);

    let multa = { diasAtraso: 0, valorTotal: 0, valorPlataforma: 0, valorProprietario: 0 };

    if (solicitacao && window.SolicitacoesVizin && solicitacao.status !== "concluido") {
        // A multa é calculada AGORA (data de conclusão), não no dia em que a
        // pessoa abriu a tela — assim o valor "congela" no momento da
        // devolução, em vez de continuar crescendo depois de o objeto já
        // ter voltado. `multaStatus: "pendente"` é o que torna o pagamento
        // OBRIGATÓRIO antes de alugar de novo (ver detalhesBloqueio em
        // solicitacoes-shared.js) — sem isso, o bloqueio por atraso sumia
        // sozinho assim que o objeto era devolvido, mesmo com a multa em
        // aberto.
        multa = window.SolicitacoesVizin.calcularMulta(solicitacao);

        window.SolicitacoesVizin.atualizarStatus(solicitacao.id, "concluido", {
            multaAtraso: multa.diasAtraso > 0 ? multa : null,
            multaStatus: multa.diasAtraso > 0 ? "pendente" : null,
            multaCongeladaEm: multa.diasAtraso > 0 ? new Date().toISOString() : null
        });

        // A locação terminou — o objeto volta a ficar disponível pra outras
        // pessoas solicitarem.
        if (window.ObjetosVizin) {
            window.ObjetosVizin.marcarDisponibilidade(solicitacao.produtoId, true);
        }

        if (window.NotificacoesVizin) {
            const formatar = window.SolicitacoesVizin.formatarReal;

            const textoMultaLocatario = multa.diasAtraso > 0
                ? ` A devolução ficou ${multa.diasAtraso} dia(s) em atraso: foi cobrada uma multa de ${formatar(multa.valorTotal)}. Enquanto ela não for paga, você não vai conseguir solicitar novos aluguéis nem aprovar locações nos seus próprios objetos.`
                : "";

            window.NotificacoesVizin.adicionarNotificacao({
                tipo: "devolucao_confirmada",
                titulo: "Devolução confirmada",
                descricao: `A devolução de "${produto.titulo}" foi confirmada. O aluguel foi concluído.${textoMultaLocatario}`,
                data: new Date().toLocaleDateString("pt-BR"),
                solicitacaoId: solicitacao.id
            }, solicitacao.solicitanteEmail);

            const textoMultaProprietario = multa.diasAtraso > 0
                ? ` A devolução ficou ${multa.diasAtraso} dia(s) em atraso: assim que ${solicitacao.solicitanteNome || "o locatário"} pagar, você vai receber ${formatar(multa.valorProprietario)} de multa (a plataforma retém ${formatar(multa.valorPlataforma)} do total de ${formatar(multa.valorTotal)}).`
                : "";

            window.NotificacoesVizin.adicionarNotificacao({
                tipo: "devolucao_confirmada",
                titulo: "Objeto devolvido",
                descricao: `${solicitacao.solicitanteNome || "O locatário"} devolveu "${produto.titulo}". Você já pode avaliar a transação.${textoMultaProprietario}`,
                data: new Date().toLocaleDateString("pt-BR"),
                solicitacaoId: solicitacao.id
            }, solicitacao.proprietarioEmail);
        }
    } else if (solicitacao?.multaAtraso) {
        // Página recarregada depois que a devolução já tinha sido concluída
        // — reaproveita o valor congelado, em vez de recalcular (o que
        // daria zero, já que a data de referência seria "agora").
        multa = solicitacao.multaAtraso;
    }

    // Sempre busca a versão mais atual da solicitação — pode ter
    // multaStatus recém-gravado logo acima, ou já ter sido paga/contestada
    // numa visita anterior a esta mesma tela (o comprovante fica salvo, não
    // é algo que "some" como uma notificação depois de lida).
    const atual = (solicitacao && window.SolicitacoesVizin)
        ? window.SolicitacoesVizin.obterPorId(solicitacao.id)
        : solicitacao;

    // Mostra o valor da multa também na própria tela, pra quem acabou de
    // confirmar a devolução não descobrir isso só pela notificação — mesmo
    // resumo claro ("R$ X será cobrado agora") que já aparecia antes de
    // confirmar, repetido aqui pra confirmar o que de fato aconteceu.
    const notaMulta = document.getElementById("confirmada-multa-nota");
    if (notaMulta) {
        if (multa.diasAtraso > 0 && window.SolicitacoesVizin) {
            const formatar = window.SolicitacoesVizin.formatarReal;
            notaMulta.textContent = meuPapel === "locatario"
                ? `${formatar(multa.valorTotal)} cobrado agora por ${multa.diasAtraso} dia(s) de atraso na devolução.`
                : `A devolução ficou ${multa.diasAtraso} dia(s) em atraso: você vai receber ${formatar(multa.valorProprietario)} de multa (a plataforma retém ${formatar(multa.valorPlataforma)}).`;
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
// Mostra (só pro locatário) o botão de pagar a multa obrigatória — junto
// com o comprovante permanente que fica salvo no Histórico (ver
// montarComprovanteMulta em historico.js), essa é a saída pra sair do
// bloqueio "duro" descrito em solicitacoes-shared.js sem precisar devolver
// mais nada (o objeto já voltou). O pagamento em si acontece na página
// dedicada de Pagamento da Multa (../Pagamento-multa/index.html).
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
        if (!solicitacao) return;

        // Leva o usuário para a página dedicada de pagamento da multa, que
        // já cuida de PIX/cartão e do POST /api/multas/:solicitacaoId/pagar.
        window.location.href = `../Pagamento-multa/index.html?solicitacaoId=${solicitacao.id}`;
    });
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