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
const dataRetirada = params.get("retirada");
const dataDevolucao = params.get("devolucao");
const solicitacaoIdParam = params.get("solicitacaoId");
 
document.getElementById("link-voltar").addEventListener("click", (e) => {
    e.preventDefault();
    window.location.href = `../Produto/index.html?id=${produtoIdUrl}`;
});
 
// ================= CANCELAR LOCAÇÃO (via modal de confirmação) =================
// Último ponto em que dá pra cancelar: assim que a retirada é confirmada
// pelas duas partes (etapa-confirmada), a locação já está em andamento e
// deixa de ser cancelável (ver STATUS_CANCELAVEIS em solicitacoes-shared.js).
// Tanto o locatário quanto o proprietário podem cancelar por aqui.
const modalCancelar = document.getElementById("modal-cancelar");
const modalCancelarVoltar = document.getElementById("modal-cancelar-voltar");
const modalCancelarConfirmar = document.getElementById("modal-cancelar-confirmar");
 
function abrirModalCancelar() {
    if (!solicitacao || !window.SolicitacoesVizin) {
        // Sem uma solicitação real por trás (ex: acesso direto de teste a
        // esta página), não tem o que cancelar de verdade — só volta.
        window.location.href = `../Produto/index.html?id=${produtoIdUrl}`;
        return;
    }
 
    modalCancelar.classList.add("show");
}
 
function fecharModalCancelar() {
    modalCancelar.classList.remove("show");
}
 
modalCancelarVoltar.addEventListener("click", fecharModalCancelar);
 
modalCancelar.addEventListener("click", (e) => {
    if (e.target === modalCancelar) fecharModalCancelar();
});
 
modalCancelarConfirmar.addEventListener("click", () => {
    modalCancelarConfirmar.disabled = true;
    modalCancelarConfirmar.textContent = "Cancelando...";
 
    // PONTO DE INTEGRAÇÃO COM O BACK-END:
    // PATCH /api/solicitacoes/:id { status: "cancelado" }
    window.SolicitacoesVizin.cancelar(solicitacao.id, usuarioLogado?.email);
 
    window.location.href = `../Historico/index.html`;
});
 
document.getElementById("btn-cancelar").addEventListener("click", abrirModalCancelar);
 
const btnCancelarAguardando = document.getElementById("btn-cancelar-aguardando");
if (btnCancelarAguardando) {
    btnCancelarAguardando.addEventListener("click", abrirModalCancelar);
}
 
// ================= DADOS DA SOLICITAÇÃO / PRODUTO =================
// PONTO DE INTEGRAÇÃO COM O BACK-END:
// Buscar via GET /api/pedidos/:solicitacaoId (deve trazer o objeto, as duas
// partes e o prazo-limite da retirada), em vez de montar isso a partir da
// tabela mock de solicitações + de um objeto de produto hardcoded.
const solicitacao = (solicitacaoIdParam && window.SolicitacoesVizin)
    ? window.SolicitacoesVizin.obterPorId(Number(solicitacaoIdParam))
    : null;
 
// Identificador único que une as duas partes nesta retirada. Sempre que
// existir uma solicitação real (fluxo completo Produto -> Pagamento ->
// Retirada), usamos o próprio id da solicitação — é o mesmo "ID do Aluguel"
// mostrado na página do Produto. Sem isso (ex: acesso direto a esta página
// para teste), cai num id de fallback baseado nos parâmetros da URL.
const aluguelId = solicitacao ? solicitacao.id : (solicitacaoIdParam || `${produtoIdUrl}_${dataRetirada}_${dataDevolucao}`);
 
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
 
// ================= SOLICITAÇÃO NÃO ENCONTRADA =================
// Antes disso, um link com solicitacaoId inválido/expirado caía
// silenciosamente no mock "Furadeira Profissional Bosch" — a pessoa achava
// que estava vendo uma locação real. Só cai nesse estado quando um id foi
// passado na URL e não foi encontrado (acesso direto de teste, sem id
// nenhum, continua caindo no mock normalmente).
const paginaEncontrada = !(solicitacaoIdParam && !solicitacao);
if (!paginaEncontrada) {
    document.getElementById("conteudo-retirada").style.display = "none";
    document.getElementById("sim-papel-toggle").style.display = "none";
    document.getElementById("etapa-erro").style.display = "block";
}
 
// ================= REAGIR A CANCELAMENTO AUTOMÁTICO (PRAZO DE RETIRADA) =================
// solicitacoes-shared.js cancela sozinho (verificarPrazos, a cada 60s)
// qualquer locação "paga" cuja data de retirada já passou — inclusive
// enquanto ESTA PRÓPRIA página estiver aberta em segundo plano. Sem essa
// checagem, alguém poderia terminar de enviar as fotos bem depois do prazo
// e "reviver" uma locação que o sistema já cancelou e estornou.
// `intervaloAcompanhamento` só é lido de dentro da função (nunca na hora de
// declará-la), então não tem problema ela ser declarada mais abaixo no
// arquivo — na hora em que isso aqui roda de verdade, ela já existe.
function verificarSeFoiCanceladaAutomaticamente() {
    if (!solicitacao || !window.SolicitacoesVizin) return false;
 
    const atual = window.SolicitacoesVizin.obterPorId(solicitacao.id);
    if (atual && atual.status === "cancelado") {
        clearInterval(intervaloAcompanhamento);
        alert("O prazo para retirada deste objeto expirou e a locação foi cancelada automaticamente. O valor pago foi estornado.");
        window.location.href = `../Historico/index.html`;
        return true;
    }
    return false;
}
 
document.addEventListener("solicitacoesAtualizadas", verificarSeFoiCanceladaAutomaticamente);
 
// ================= DESCOBRIR O PAPEL DE QUEM ESTÁ LOGADO =================
// Cada pessoa acessa esta página pelo próprio dispositivo. A página descobre
// se quem está logado é o locatário ou o proprietário comparando o e-mail
// da sessão com o e-mail do proprietário do objeto.
// ================= [SÓ PARA TESTES] TOGGLE DE PAPEL =================
// TODO: remover quando integrar com o back-end real.
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
// virava "locatário" automaticamente (ver papelReal acima) e conseguia
// enviar fotos como se fizesse parte da locação. O toggle de simulação
// (só pra testes) continua funcionando normalmente por cima disso.
if (paginaEncontrada && solicitacao && !sessionStorage.getItem(CHAVE_SIM_PAPEL)) {
    const souParteDaLocacao = usuarioLogado?.email === solicitacao.solicitanteEmail
        || usuarioLogado?.email === solicitacao.proprietarioEmail;
 
    if (!souParteDaLocacao) {
        document.getElementById("conteudo-retirada").style.display = "none";
        document.getElementById("sim-papel-toggle").style.display = "none";
        document.getElementById("etapa-acesso-negado").style.display = "block";
    }
}
 
// ================= PRAZO DA RETIRADA (visível na própria tela) =================
// Antes disso a pessoa só descobria que o prazo estava apertado olhando o
// card no Histórico. Mesma lógica de parse de data usada em
// solicitacoes-shared.js (evita o "puxa um dia pra trás" do fuso horário).
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
        texto = "A retirada precisa ser confirmada hoje, ou o aluguel será cancelado automaticamente.";
        prazoCard.classList.add("prazo-urgente");
    } else {
        return; // já passou — verificarSeFoiCanceladaAutomaticamente cuida disso
    }
 
    prazoTexto.textContent = texto;
    prazoCard.style.display = "flex";
})();
 
// ================= COMPRESSÃO DE FOTOS PRA BASE64 =================
// PONTO DE INTEGRAÇÃO COM O BACK-END:
// Isso existe só porque, no mock, as fotos precisam ficar salvas em
// localStorage (via RetiradaVizin) pra aparecerem depois no Histórico de
// Aluguéis. Redimensionamos e comprimimos pra não estourar a cota do
// localStorage (mesmo problema já visto no cadastro de objeto). Em produção,
// isso deixa de ser necessário: as fotos originais vão direto pro back-end
// via multipart, e o Histórico passa a consumir as URLs devolvidas por ele.
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
let fotosJaEnviadas = false;
window.addEventListener("beforeunload", (e) => {
    if (minhasFotos.length > 0 && !fotosJaEnviadas) {
        e.preventDefault();
        e.returnValue = "";
    }
});
 
// ================= STATUS DA OUTRA PARTE =================
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
        texto.innerHTML = `${nomesPapel[papel]}${souEu ? " (você)" : ""}
            <span class="status-linha-sub">${dados.enviado ? `${dados.quantidade} foto(s) enviada(s)` : "Ainda não enviou as fotos"}</span>`;
 
        linha.appendChild(icone);
        linha.appendChild(texto);
        statusLista.appendChild(linha);
    });
 
    return status;
}
 
renderizarStatus();
 
// Se eu já tiver enviado minhas fotos anteriormente (reabri a página),
// pula direto pro estado de aguardando ou de confirmado.
(function retomarEstadoSeExistir() {
    const status = RetiradaVizin.obterStatus(aluguelId);
    if (status[meuPapel].enviado) {
        if (RetiradaVizin.ambosConcluidos(aluguelId)) {
            finalizarRetirada();
        } else {
            mostrarAguardando();
        }
    }
})();
 
// ================= ENVIAR MINHAS FOTOS =================
btnEnviar.addEventListener("click", async () => {
    if (minhasFotos.length === 0) return;
    if (verificarSeFoiCanceladaAutomaticamente()) return;
 
    btnEnviar.disabled = true;
    btnEnviar.innerHTML = `<span class="spinner"></span> Enviando...`;
 
    const observacoes = document.getElementById("observacoes").value.trim();
 
    try {
        // PONTO DE INTEGRAÇÃO COM O BACK-END:
        // const formData = new FormData();
        // formData.append("aluguel_id", aluguelId);
        // formData.append("papel", meuPapel);
        // formData.append("observacoes", observacoes);
        // minhasFotos.forEach(arquivo => formData.append("fotos", arquivo, arquivo.name));
        //
        // const response = await fetch("/api/retiradas/fotos", {
        //     method: "POST",
        //     headers: { "Authorization": `Bearer ${localStorage.getItem("token")}` },
        //     body: formData
        // });
        // if (!response.ok) throw new Error("Erro ao enviar fotos");
        //
        // O back-end também deve controlar o prazo-limite da retirada: se ele
        // expirar sem que as duas partes enviem suas fotos, o aluguel deve ser
        // cancelado automaticamente e o valor pago deve retornar ao locatário.
 
        const fotosBase64 = await comprimirFotos(minhasFotos);
 
        await new Promise(resolve => setTimeout(resolve, 1000)); // simula envio
 
        RetiradaVizin.enviarFotos(aluguelId, meuPapel, minhasFotos.length, observacoes, fotosBase64);
        fotosJaEnviadas = true;
 
        if (RetiradaVizin.ambosConcluidos(aluguelId)) {
            finalizarRetirada();
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
 
// Fecha o ciclo da retirada: atualiza o status da solicitação e notifica as
// duas partes (uma vez só, mesmo que as duas abas detectem a conclusão
// quase ao mesmo tempo via polling).
function finalizarRetirada() {
    clearInterval(intervaloAcompanhamento);
 
    if (solicitacao && window.SolicitacoesVizin && solicitacao.status !== "retirado") {
        // Agora "retirado" é um passo intermediário — o ciclo só termina de
        // verdade em "concluido", depois da devolução.
        window.SolicitacoesVizin.atualizarStatus(solicitacao.id, "retirado");
 
        if (window.NotificacoesVizin) {
            window.NotificacoesVizin.adicionarNotificacao({
                tipo: "retirada_confirmada",
                titulo: "Retirada confirmada",
                descricao: `A retirada de "${produto.titulo}" foi confirmada por ambas as partes.`,
                data: new Date().toLocaleDateString("pt-BR"),
                solicitacaoId: solicitacao.id
            }, solicitacao.solicitanteEmail);
 
            window.NotificacoesVizin.adicionarNotificacao({
                tipo: "pagamento_liberado",
                titulo: "Pagamento liberado!",
                descricao: `A retirada de "${produto.titulo}" foi confirmada e o valor de R$ ${solicitacao.total} foi liberado para sua conta.`,
                data: new Date().toLocaleDateString("pt-BR"),
                solicitacaoId: solicitacao.id
            }, solicitacao.proprietarioEmail);
        }
    }
 
    document.getElementById("etapa-enviar").style.display = "none";
    document.getElementById("etapa-aguardando").style.display = "none";
    document.getElementById("etapa-confirmada").style.display = "block";
 
    // Agora que existe a tela de acompanhamento, redireciona pra lá em vez
    // de voltar pra home.
    const idDestino = solicitacao ? solicitacao.id : aluguelId;
    document.getElementById("confirmada-subtexto").innerHTML =
        `Você será redirecionado para acompanhar o andamento da locação.`;
 
    setTimeout(() => {
        window.location.href = `../Status-locacao/index.html?solicitacaoId=${idDestino}`;
    }, 2000);
}
 
// PONTO DE INTEGRAÇÃO COM O BACK-END:
// Trocar por WebSocket, ou por um GET periódico em /api/retiradas/:aluguelId/status.
function acompanharOutraParte() {
    clearInterval(intervaloAcompanhamento);
 
    intervaloAcompanhamento = setInterval(() => {
        if (verificarSeFoiCanceladaAutomaticamente()) return;
        renderizarStatus();
        if (RetiradaVizin.ambosConcluidos(aluguelId)) {
            finalizarRetirada();
        }
    }, 1000);
}
 
// ================= [SÓ PARA TESTES] SIMULAR A OUTRA PARTE =================
// TODO: remover este bloco inteiro quando integrar com o back-end real.
// Existe só porque, testando sozinho com mocks em localStorage, as duas
// "pessoas" precisariam estar logadas em sessões/navegadores diferentes pra
// esse fluxo avançar de verdade. Este botão permite testar o fluxo inteiro
// numa aba só.
const btnSimularOutraParte = document.getElementById("btn-simular-outra-parte");
if (btnSimularOutraParte) {
    btnSimularOutraParte.addEventListener("click", () => {
        // Não existe arquivo real pra comprimir aqui (é só simulação), então
        // usamos fotos de rosto genérico de um serviço público só pra dar
        // pra visualizar o card do Histórico preenchido de ponta a ponta.
        const fotosSimuladas = [
            `https://i.pravatar.cc/150?u=${aluguelId}-${papelDaOutraParte}-1`,
            `https://i.pravatar.cc/150?u=${aluguelId}-${papelDaOutraParte}-2`
        ];
        RetiradaVizin.enviarFotos(aluguelId, papelDaOutraParte, 2, "Fotos simuladas para teste", fotosSimuladas);
        const status = renderizarStatus();
        if (RetiradaVizin.ambosConcluidos(aluguelId)) {
            finalizarRetirada();
        }
    });
}