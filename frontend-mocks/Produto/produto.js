// ================= PROTEGER PÁGINA =================
if (!localStorage.getItem("token")) {
    window.location.href = "../Login/index.html";
}
 
// ================= USUÁRIO LOGADO =================
const usuarioLogado = JSON.parse(localStorage.getItem("usuario") || "null");
 
// ================= [SÓ PARA TESTES] TOGGLE "VER COMO TERCEIRA PESSOA" =================
// TODO: remover quando integrar com o back-end real.
const CHAVE_SIM_VISAO = "vizin_sim_visao_override";
const visaoSimulada = sessionStorage.getItem(CHAVE_SIM_VISAO) || "eu";
 
document.querySelectorAll("#sim-visao-toggle .sim-papel-btn").forEach(btn => {
    btn.classList.toggle("ativo", btn.dataset.visao === visaoSimulada);
    btn.addEventListener("click", () => {
        sessionStorage.setItem(CHAVE_SIM_VISAO, btn.dataset.visao);
        location.reload();
    });
});
 
// ================= LER ID DO PRODUTO NA URL =================
const params = new URLSearchParams(window.location.search);
const produtoId = params.get("id") || "1";
 
// ================= PRODUTO (vindo do módulo compartilhado) =================
// PONTO DE INTEGRAÇÃO COM O BACK-END:
// let produto = null;
// async function carregarProduto() {
//     const response = await fetch(`/api/objetos/${produtoId}`);
//     if (!response.ok) throw new Error("Objeto não encontrado");
//     produto = await response.json();
//     preencherProduto(produto);
// }
// carregarProduto();
const produto = window.ObjetosVizin ? window.ObjetosVizin.obterPorId(produtoId) : null;
 
if (!produto) {
    document.querySelector(".produto-grid").innerHTML =
        `<div style="grid-column:1/-1; text-align:center; padding:60px 20px;">
            <p style="color:var(--texto-suave); margin-bottom:20px;">
                Este objeto não foi encontrado ou não está mais disponível.
            </p>
            <a href="../Inicio/index.html" class="btn btn-secondary" style="text-decoration:none;">
                Ver outros objetos disponíveis
            </a>
        </div>`;
    throw new Error("Produto não encontrado");
}
 
// ================= SOU O DONO DESTE OBJETO? =================
// Antes disso não existia NENHUMA checagem de propriedade real na página:
// o único toggle que existia ("Meu usuário" / "Terceira pessoa", acima) é
// só pra simular se você JÁ TEM uma solicitação anterior nesse produto —
// não tem relação com ser dono ou não. Resultado: o dono via a mesma
// sidebar de "Solicitar Aluguel" de um locatário comum ao visitar o
// próprio anúncio (ex: logo após cadastrar em Cadastrar-objeto.js, ou
// clicando em "Ver Objeto" no próprio Histórico) — não fazia sentido
// nenhum a pessoa "alugar" o próprio objeto.
function souDonoReal() {
    return !!(usuarioLogado?.email && produto.proprietarioEmail && usuarioLogado.email === produto.proprietarioEmail);
}
 
// ================= [SÓ PARA TESTES] TOGGLE "VER COMO LOCATÁRIO/PROPRIETÁRIO" =================
// TODO: remover quando integrar com o back-end real. Mesma chave de
// sessionStorage (vizin_sim_papel_override) já usada em Retirada-objeto,
// Devolucao-objeto, Avaliacao e Historico — permite forçar a visão de dono
// (ou de locatário, mesmo no seu próprio anúncio) sem precisar logar como
// duas contas diferentes pra testar.
const CHAVE_SIM_PAPEL = "vizin_sim_papel_override";
const papelSimulado = sessionStorage.getItem(CHAVE_SIM_PAPEL);
const souDono = papelSimulado ? (papelSimulado === "proprietario") : souDonoReal();
 
document.querySelectorAll("#sim-papel-toggle-produto .sim-papel-btn").forEach(btn => {
    btn.classList.toggle("ativo", btn.dataset.papel === (souDono ? "proprietario" : "locatario"));
    btn.addEventListener("click", () => {
        sessionStorage.setItem(CHAVE_SIM_PAPEL, btn.dataset.papel);
        location.reload();
    });
});
 
// ================= GALERIA DE FOTOS (setas, miniaturas e modal em tela cheia) =================
let imagensGaleria = [];
let indiceGaleria = 0;
 
/* ---------- Foto principal: setas + contador ----------
   CORRIGIDO: as setas e o contador agora só recebem classes CSS
   (.produto-imagem-nav.prev / .next / .produto-imagem-contador), definidas
   em produto.css. Antes o botão "next" era montado copiando o cssText do
   "prev" via string.replace("left:12px", "right:12px") — mas ao LER
   style.cssText de volta o navegador reformata a string (ex: vira
   "left: 12px;" com espaço), o replace parava de encontrar o texto e as
   duas setas ficavam empilhadas do mesmo lado. Usar classes elimina esse
   problema de raiz. Também trocamos a imagem pra display:block (via CSS)
   pra remover o espaço de baseline que fazia o contador parecer flutuar
   embaixo da foto em vez de ficar colado no canto dela. */
function renderizarGaleriaProduto(imagens) {
    imagensGaleria = imagens;
    indiceGaleria = 0;
 
    const imgPrincipal = document.getElementById("produto-imagem");
    imgPrincipal.style.cursor = "zoom-in";
 
    // Envolve a imagem principal num container relativo, pra poder
    // posicionar as setas e o contador por cima dela.
    let wrapper = document.getElementById("produto-imagem-wrapper");
    if (!wrapper) {
        wrapper = document.createElement("div");
        wrapper.id = "produto-imagem-wrapper";
        imgPrincipal.parentNode.insertBefore(wrapper, imgPrincipal);
        wrapper.appendChild(imgPrincipal);
    }
 
    let prevBtn = document.getElementById("produto-imagem-prev");
    let nextBtn = document.getElementById("produto-imagem-next");
    let contadorPrincipal = document.getElementById("produto-imagem-contador");
 
    if (!prevBtn) {
        prevBtn = document.createElement("button");
        prevBtn.type = "button";
        prevBtn.id = "produto-imagem-prev";
        prevBtn.className = "produto-imagem-nav prev";
        prevBtn.setAttribute("aria-label", "Foto anterior");
        prevBtn.innerHTML = "&lsaquo;";
        wrapper.appendChild(prevBtn);
 
        nextBtn = document.createElement("button");
        nextBtn.type = "button";
        nextBtn.id = "produto-imagem-next";
        nextBtn.className = "produto-imagem-nav next";
        nextBtn.setAttribute("aria-label", "Próxima foto");
        nextBtn.innerHTML = "&rsaquo;";
        wrapper.appendChild(nextBtn);
 
        contadorPrincipal = document.createElement("span");
        contadorPrincipal.id = "produto-imagem-contador";
        contadorPrincipal.className = "produto-imagem-contador";
        wrapper.appendChild(contadorPrincipal);
 
        prevBtn.addEventListener("click", (e) => { e.stopPropagation(); mudarImagemPrincipal(-1); });
        nextBtn.addEventListener("click", (e) => { e.stopPropagation(); mudarImagemPrincipal(1); });
 
        // Clicar na foto abre o modal em tamanho original
        imgPrincipal.addEventListener("click", () => abrirModalFotos(indiceGaleria));
    }
 
    // Faixa de miniaturas abaixo da foto
    if (!document.getElementById("produto-thumbs")) {
        const thumbsContainer = document.createElement("div");
        thumbsContainer.id = "produto-thumbs";
        wrapper.insertAdjacentElement("afterend", thumbsContainer);
    }
 
    atualizarImagemPrincipal();
}
 
function mudarImagemPrincipal(delta) {
    if (imagensGaleria.length <= 1) return;
    indiceGaleria = (indiceGaleria + delta + imagensGaleria.length) % imagensGaleria.length;
    atualizarImagemPrincipal();
}
 
function atualizarImagemPrincipal() {
    const imgPrincipal = document.getElementById("produto-imagem");
    imgPrincipal.src = imagensGaleria[indiceGaleria];
 
    const multiplo = imagensGaleria.length > 1;
    const prevBtn = document.getElementById("produto-imagem-prev");
    const nextBtn = document.getElementById("produto-imagem-next");
    const contador = document.getElementById("produto-imagem-contador");
    if (prevBtn) prevBtn.style.display = multiplo ? "flex" : "none";
    if (nextBtn) nextBtn.style.display = multiplo ? "flex" : "none";
    if (contador) {
        contador.style.display = multiplo ? "block" : "none";
        contador.textContent = `${indiceGaleria + 1}/${imagensGaleria.length}`;
    }
 
    // Sincroniza as miniaturas (qual está com a borda ativa)
    const thumbsContainer = document.getElementById("produto-thumbs");
    if (!thumbsContainer) return;
 
    thumbsContainer.innerHTML = "";
 
    if (imagensGaleria.length <= 1) {
        thumbsContainer.style.display = "none";
        return;
    }
    thumbsContainer.style.display = "flex";
 
    imagensGaleria.forEach((url, index) => {
        const thumb = document.createElement("img");
        thumb.src = url;
        thumb.alt = `Foto ${index + 1} de ${imagensGaleria.length}`;
        thumb.classList.toggle("thumb-ativa", index === indiceGaleria);
        thumb.addEventListener("click", () => {
            indiceGaleria = index;
            atualizarImagemPrincipal();
        });
        thumbsContainer.appendChild(thumb);
    });
}
 
/* ---------- Modal (lightbox) com a foto em tamanho original ---------- */
function criarModalFotos() {
    if (document.getElementById("produto-modal-fotos")) return;
 
    const overlay = document.createElement("div");
    overlay.id = "produto-modal-fotos";
    overlay.style.cssText = "display:none;position:fixed;inset:0;background:rgba(0,0,0,.92);z-index:9999;align-items:center;justify-content:center;";
    overlay.innerHTML = `
        <button id="produto-modal-fechar" type="button" aria-label="Fechar"
            style="position:absolute;top:20px;right:24px;width:40px;height:40px;border-radius:50%;border:none;background:rgba(255,255,255,.15);color:#fff;font-size:24px;line-height:1;cursor:pointer;display:flex;align-items:center;justify-content:center;">&times;</button>
        <button id="produto-modal-prev" type="button" aria-label="Foto anterior"
            style="position:absolute;top:50%;left:20px;transform:translateY(-50%);width:44px;height:44px;border-radius:50%;border:none;background:rgba(255,255,255,.15);color:#fff;font-size:26px;line-height:1;cursor:pointer;display:flex;align-items:center;justify-content:center;">&lsaquo;</button>
        <img id="produto-modal-img" src="" alt="" style="max-width:88vw;max-height:88vh;object-fit:contain;border-radius:6px;">
        <button id="produto-modal-next" type="button" aria-label="Próxima foto"
            style="position:absolute;top:50%;right:20px;transform:translateY(-50%);width:44px;height:44px;border-radius:50%;border:none;background:rgba(255,255,255,.15);color:#fff;font-size:26px;line-height:1;cursor:pointer;display:flex;align-items:center;justify-content:center;">&rsaquo;</button>
        <span id="produto-modal-contador"
            style="position:absolute;bottom:24px;left:50%;transform:translateX(-50%);background:rgba(255,255,255,.15);color:#fff;padding:4px 14px;border-radius:14px;font-size:13px;"></span>
    `;
    document.body.appendChild(overlay);
 
    document.getElementById("produto-modal-fechar").addEventListener("click", fecharModalFotos);
    overlay.addEventListener("click", (e) => { if (e.target === overlay) fecharModalFotos(); });
    document.getElementById("produto-modal-prev").addEventListener("click", () => navegarModalFotos(-1));
    document.getElementById("produto-modal-next").addEventListener("click", () => navegarModalFotos(1));
 
    document.addEventListener("keydown", (e) => {
        if (overlay.style.display !== "flex") return;
        if (e.key === "Escape") fecharModalFotos();
        if (e.key === "ArrowLeft") navegarModalFotos(-1);
        if (e.key === "ArrowRight") navegarModalFotos(1);
    });
}
 
function abrirModalFotos(indiceInicial) {
    criarModalFotos();
    indiceGaleria = indiceInicial;
    atualizarModalFotos();
    document.getElementById("produto-modal-fotos").style.display = "flex";
    document.body.style.overflow = "hidden";
}
 
function fecharModalFotos() {
    const overlay = document.getElementById("produto-modal-fotos");
    if (overlay) overlay.style.display = "none";
    document.body.style.overflow = "";
}
 
function navegarModalFotos(delta) {
    if (imagensGaleria.length <= 1) return;
    indiceGaleria = (indiceGaleria + delta + imagensGaleria.length) % imagensGaleria.length;
    atualizarModalFotos();
    atualizarImagemPrincipal(); // mantém a foto principal e as miniaturas sincronizadas
}
 
function atualizarModalFotos() {
    document.getElementById("produto-modal-img").src = imagensGaleria[indiceGaleria];
    const contador = document.getElementById("produto-modal-contador");
    const prevBtn = document.getElementById("produto-modal-prev");
    const nextBtn = document.getElementById("produto-modal-next");
    const multiplo = imagensGaleria.length > 1;
    contador.textContent = `${indiceGaleria + 1}/${imagensGaleria.length}`;
    contador.style.display = multiplo ? "block" : "none";
    prevBtn.style.display = multiplo ? "flex" : "none";
    nextBtn.style.display = multiplo ? "flex" : "none";
}
 
function preencherProduto(obj) {
    const imagensProduto = (obj.imagens && obj.imagens.length) ? obj.imagens : [obj.imagem];
 
    document.getElementById("produto-imagem").alt = obj.titulo;
    document.getElementById("produto-titulo").textContent = obj.titulo;
    document.getElementById("produto-preco").textContent = formatarPreco(obj.preco_dia);
    document.getElementById("produto-localizacao").textContent = obj.localizacao;
    document.getElementById("produto-categoria").textContent = obj.categoria;
    document.getElementById("produto-descricao").textContent = obj.descricao;
    document.getElementById("proprietario-avatar").textContent = (obj.proprietarioNome || "?").charAt(0);
    document.getElementById("proprietario-nome").textContent = obj.proprietarioNome;
 
    renderizarGaleriaProduto(imagensProduto);
 
    // Média real de avaliações do proprietário, calculada a partir das
    // avaliações que ele recebeu como locatário e/ou proprietário em
    // alugueis passados (ver avaliacoes-shared.js -> obterAvaliacoesRecebidas).
    const avProprietario = (window.AvaliacoesVizin && window.SolicitacoesVizin)
        ? window.AvaliacoesVizin.obterAvaliacoesRecebidas(obj.proprietarioEmail)
        : { media: 0, total: 0 };
 
    document.getElementById("proprietario-avaliacao").textContent =
        avProprietario.total > 0 ? avProprietario.media.toFixed(1) : "Novo";
 
    document.getElementById("pendente-proprietario-nome").textContent = obj.proprietarioNome;
}
 
preencherProduto(produto);
 
document.getElementById("btn-ver-perfil").addEventListener("click", () => {
    window.location.href = `../Perfil/index.html?id=${produto.proprietarioEmail}`;
});
 
// ================= DENUNCIAR ANÚNCIO =================
// Não faz sentido a pessoa denunciar o próprio anúncio, então o link nem
// aparece pro dono (mesmo padrão do resto da sidebar, ver "souDono").
const btnDenunciarAnuncio = document.getElementById("btn-denunciar-anuncio");
if (btnDenunciarAnuncio) {
    if (souDono) {
        btnDenunciarAnuncio.style.display = "none";
    } else {
        btnDenunciarAnuncio.addEventListener("click", () => {
            const queryDenuncia = new URLSearchParams({
                tipo: "denuncia",
                produtoId: produto.id,
                produtoTitulo: produto.titulo,
                proprietarioId: produto.proprietarioEmail,
                proprietarioNome: produto.proprietarioNome
            });
            // Se já existe uma solicitação/locação em andamento com esse
            // anúncio, manda o ID junto — evita a pessoa ter que copiar o
            // ID do aluguel na mão (ver "btn-copiar-id" mais abaixo).
            if (idSolicitacaoAtual) queryDenuncia.set("aluguelId", idSolicitacaoAtual);
            window.location.href = `../Suporte/index.html?${queryDenuncia.toString()}`;
        });
    }
}
 
// ================= CONVERSAR COM O PROPRIETÁRIO =================
document.getElementById("btn-conversar").addEventListener("click", () => {
    const query = new URLSearchParams({
        userId: produto.proprietarioEmail,
        userName: produto.proprietarioNome,
        produtoId: produto.id,
        produtoTitulo: produto.titulo
    });
    window.location.href = `../Mensagens/index.html?${query.toString()}`;
});
 
// ================= CÁLCULO DE PERÍODO E TOTAL =================
const inputRetirada = document.getElementById("data-retirada");
const inputDevolucao = document.getElementById("data-devolucao");
const resumoDatas = document.getElementById("resumo-datas");
const btnSolicitar = document.getElementById("btn-solicitar");
 
const hoje = new Date().toISOString().split("T")[0];
inputRetirada.min = hoje;
 
function calcularPeriodo() {
    const retirada = inputRetirada.value;
    const devolucao = inputDevolucao.value;
 
    if (!retirada || !devolucao) {
        resumoDatas.style.display = "none";
        return null;
    }
 
    const dataRetirada = new Date(retirada);
    const dataDevolucao = new Date(devolucao);
    const diffMs = dataDevolucao - dataRetirada;
    const dias = Math.round(diffMs / (1000 * 60 * 60 * 24));
 
    if (dias <= 0) {
        resumoDatas.style.display = "none";
        return null;
    }
 
    const total = dias * produto.preco_dia;
 
    document.getElementById("resumo-periodo").textContent = `${dias} dia${dias > 1 ? "s" : ""}`;
    document.getElementById("resumo-preco-dia").textContent = formatarPreco(produto.preco_dia);
    document.getElementById("resumo-total").textContent = formatarPreco(total);
    resumoDatas.style.display = "block";
 
    return { dias, total, retirada, devolucao };
}
 
[inputRetirada, inputDevolucao].forEach(input => {
    input.addEventListener("change", () => {
        inputDevolucao.min = inputRetirada.value || hoje;
        calcularPeriodo();
    });
});
 
// ================= BLOQUEIA SOLICITAÇÃO SE O OBJETO ESTIVER INDISPONÍVEL =================
// `disponivel: false` pode significar duas coisas bem diferentes pra quem
// está olhando a página do produto:
//   1) O objeto está em locação ativa agora (alguém já alugou) — ver
//      ObjetosVizin.temLocacaoAtiva, que checa as solicitações de verdade.
//   2) O dono simplesmente pausou o anúncio (não quer alugar por enquanto),
//      sem nenhuma locação em andamento.
// A mensagem exibida deve refletir qual dos dois casos é o real, em vez de
// sempre dizer "já está alugado".
function atualizarDisponibilidade() {
    const atual = window.ObjetosVizin.obterPorId(produto.id);
    if (!atual) return;
 
    const indisponivel = !atual.disponivel;
    const emLocacao = window.ObjetosVizin.temLocacaoAtiva(produto.id);
 
    // Locatário com uma devolução em atraso em OUTRA locação fica impedido
    // de solicitar novos aluguéis até devolver o que está pendente — ver
    // SolicitacoesVizin.estaBloqueadoPorAtraso.
    const bloqueadoPorAtraso = !!(usuarioLogado?.email && window.SolicitacoesVizin
        && window.SolicitacoesVizin.estaBloqueadoPorAtraso(usuarioLogado.email));
 
    btnSolicitar.disabled = indisponivel || bloqueadoPorAtraso;
 
    let avisoIndisponivel = document.getElementById("aviso-indisponivel");
 
    if (indisponivel) {
        btnSolicitar.textContent = emLocacao ? "Objeto Alugado" : "Objeto Indisponível";
        const mensagem = emLocacao
            ? "Este objeto já está alugado no momento. Tente novamente mais tarde."
            : "Este objeto não está disponível no momento.";
 
        if (!avisoIndisponivel) {
            avisoIndisponivel = document.createElement("p");
            avisoIndisponivel.id = "aviso-indisponivel";
            avisoIndisponivel.className = "sidebar-aviso";
            avisoIndisponivel.style.color = "#dc2626";
            btnSolicitar.insertAdjacentElement("afterend", avisoIndisponivel);
        }
        avisoIndisponivel.textContent = mensagem;
    } else if (bloqueadoPorAtraso) {
        btnSolicitar.textContent = "Devolução Pendente";
 
        if (!avisoIndisponivel) {
            avisoIndisponivel = document.createElement("p");
            avisoIndisponivel.id = "aviso-indisponivel";
            avisoIndisponivel.className = "sidebar-aviso";
            avisoIndisponivel.style.color = "#dc2626";
            btnSolicitar.insertAdjacentElement("afterend", avisoIndisponivel);
        }
        avisoIndisponivel.textContent = "Você tem um objeto com devolução em atraso. Devolva-o para poder solicitar novos aluguéis.";
    } else {
        btnSolicitar.textContent = "Solicitar Aluguel";
        if (avisoIndisponivel) avisoIndisponivel.remove();
    }
}
 
atualizarDisponibilidade();
document.addEventListener("objetosAtualizados", atualizarDisponibilidade);
document.addEventListener("solicitacoesAtualizadas", atualizarDisponibilidade);
 
// ================= ESTADOS DA SIDEBAR =================
const cardDono = document.getElementById("card-dono");
const cardSolicitar = document.getElementById("card-solicitar");
const cardPendente = document.getElementById("card-pendente");
const cardAprovado = document.getElementById("card-aprovado");
const cardRejeitado = document.getElementById("card-rejeitado");
const cardPago = document.getElementById("card-pago");
const cardEmUso = document.getElementById("card-em-uso");
const cardAguardandoDevolucao = document.getElementById("card-aguardando-devolucao");
const cardConcluido = document.getElementById("card-concluido");
 
const TODOS_OS_CARDS = {
    dono: cardDono,
    solicitar: cardSolicitar,
    pendente: cardPendente,
    aprovado: cardAprovado,
    rejeitado: cardRejeitado,
    pago: cardPago,
    "em-uso": cardEmUso,
    "aguardando-devolucao": cardAguardandoDevolucao,
    concluido: cardConcluido
};
 
function mostrarEstado(estado) {
    Object.entries(TODOS_OS_CARDS).forEach(([chave, el]) => {
        el.style.display = chave === estado ? "block" : "none";
    });
}
 
// Se o usuário logado é o próprio dono do objeto, a sidebar mostra só o
// card "dono" — nenhuma das telas de solicitação/status de locatário faz
// sentido aqui, então nem deixamos elas competirem por espaço.
if (souDono) {
    mostrarEstado("dono");
    document.getElementById("btn-gerenciar-objeto").href = "../Meus-objetos/index.html";
    document.getElementById("btn-ver-solicitacoes-dono").href = "../Historico/index.html?tab=solicitacoes";
}
 
let dadosSolicitacao = null;
let intervaloAcompanhamento = null;
 
// ================= ID DA SOLICITAÇÃO ATUAL =================
// Guarda o id da solicitação/aluguel em andamento com este objeto — usado
// pra cancelar a locação (ver "btn-cancelar-*" mais abaixo) e pra
// pré-preencher o aluguel relacionado quando a pessoa clica em "Denunciar
// anúncio" (ver linha ~321). Antes também alimentava um "ID do Aluguel"
// visível + botão de copiar no card-aprovado, pra pessoa colar esse número
// no campo de denúncia; removido porque o campo de denúncia agora é um
// select preenchido automaticamente com os aluguéis da pessoa, então não
// existe mais nada pra colar.
let idSolicitacaoAtual = null;
 
function preencherIdAluguel(id) {
    idSolicitacaoAtual = id;
}
 
function configurarLinksPosPagamento(s) {
    idSolicitacaoAtual = s.id;
 
    const queryRetirada = new URLSearchParams({
        produtoId: produto.id,
        retirada: s.dataRetirada,
        devolucao: s.dataDevolucao,
        solicitacaoId: s.id
    });
    document.getElementById("btn-ir-retirada").href = `../Retirada-objeto/index.html?${queryRetirada.toString()}`;
 
    document.getElementById("btn-ver-status-uso").href = `../Status-locacao/index.html?solicitacaoId=${s.id}`;
 
    const queryDevolucao = new URLSearchParams({ produtoId: produto.id, solicitacaoId: s.id });
    document.getElementById("btn-ir-devolucao").href = `../Devolucao-objeto/index.html?${queryDevolucao.toString()}`;
 
    document.getElementById("btn-avaliar-locacao").href = `../Avaliacao/index.html?solicitacaoId=${s.id}`;
}
 
btnSolicitar.addEventListener("click", async () => {
    if (souDono) return; // proteção extra: o botão já fica oculto pro dono, isso é só reforço
    const objetoAtual = window.ObjetosVizin.obterPorId(produto.id);
    if (!objetoAtual || !objetoAtual.disponivel) {
        alert("Este objeto não está mais disponível.");
        atualizarDisponibilidade();
        return;
    }
 
    const periodo = calcularPeriodo();
 
    if (!periodo) {
        alert("Selecione datas de retirada e devolução válidas.");
        return;
    }
 
    if (!usuarioLogado?.email) {
        alert("Você precisa estar logado para solicitar um aluguel.");
        return;
    }
 
    btnSolicitar.disabled = true;
    btnSolicitar.innerHTML = `<span class="spinner"></span> Enviando...`;
 
    try {
        // PONTO DE INTEGRAÇÃO COM O BACK-END:
        // POST /api/solicitacoes { objeto_id, data_retirada, data_devolucao }
        const solicitacao = SolicitacoesVizin.criar({
            produtoId: produto.id,
            produtoTitulo: produto.titulo,
            categoriaProduto: produto.categoria,
            imagemProduto: produto.imagem,
            localizacaoProduto: produto.localizacao,
            solicitanteEmail: usuarioLogado.email,
            solicitanteNome: usuarioLogado.nome,
            proprietarioEmail: produto.proprietarioEmail,
            proprietarioNome: produto.proprietarioNome,
            dataRetirada: periodo.retirada,
            dataDevolucao: periodo.devolucao,
            dias: periodo.dias,
            total: periodo.total
        });
 
        dadosSolicitacao = { id: solicitacao.id, ...periodo };
        idSolicitacaoAtual = solicitacao.id;
 
        if (window.NotificacoesVizin) {
            window.NotificacoesVizin.adicionarNotificacao(
                {
                    tipo: "solicitacao_aluguel",
                    titulo: "Nova solicitação de aluguel",
                    descricao: `${usuarioLogado.nome || "Alguém"} pediu para alugar "${produto.titulo}" (${periodo.dias} dia${periodo.dias > 1 ? "s" : ""}).`,
                    data: new Date().toLocaleDateString("pt-BR"),
                    solicitacaoId: solicitacao.id
                },
                produto.proprietarioEmail
            );
        }
 
        mostrarEstado("pendente");
        acompanharSolicitacao(solicitacao.id);
 
    } catch (err) {
        console.error(err);
 
        if (err.message === "BLOQUEADO_POR_ATRASO") {
            alert("Você tem um objeto com devolução em atraso. Devolva-o para poder solicitar novos aluguéis.");
        } else {
            alert("Não foi possível enviar sua solicitação. Tente novamente.");
        }
 
        atualizarDisponibilidade();
    }
});
 
// ================= ACOMPANHAR RESPOSTA (POLLING) =================
function acompanharSolicitacao(id) {
    clearInterval(intervaloAcompanhamento);
 
    intervaloAcompanhamento = setInterval(() => {
        const atual = SolicitacoesVizin.obterPorId(id);
        if (!atual) return;
 
        if (atual.status === "aprovado") {
            clearInterval(intervaloAcompanhamento);
            preencherIdAluguel(atual.id);
            mostrarEstado("aprovado");
        } else if (atual.status === "rejeitado") {
            clearInterval(intervaloAcompanhamento);
            mostrarEstado("rejeitado");
        }
    }, 1000);
}
 
(function retomarEstadoSeExistir() {
    if (souDono) return; // dono não tem estado de locatário pra restaurar
    if (visaoSimulada === "terceiro") return;
    if (!usuarioLogado?.email || !window.SolicitacoesVizin) return;
 
    const maisRecente = SolicitacoesVizin.obterDoSolicitante(usuarioLogado.email)
        .filter(s => s.produtoId === produto.id)
        .sort((a, b) => b.id - a.id)[0];
 
    if (!maisRecente) return;
 
    switch (maisRecente.status) {
        case "pendente":
            idSolicitacaoAtual = maisRecente.id;
            mostrarEstado("pendente");
            acompanharSolicitacao(maisRecente.id);
            break;
 
        case "aprovado":
            dadosSolicitacao = {
                id: maisRecente.id,
                dias: maisRecente.dias,
                total: maisRecente.total,
                retirada: maisRecente.dataRetirada,
                devolucao: maisRecente.dataDevolucao
            };
            preencherIdAluguel(maisRecente.id);
            mostrarEstado("aprovado");
            break;
 
        case "pago":
            configurarLinksPosPagamento(maisRecente);
            mostrarEstado("pago");
            break;
 
        case "retirado":
            configurarLinksPosPagamento(maisRecente);
            mostrarEstado("em-uso");
            break;
 
        case "aguardando_devolucao":
            configurarLinksPosPagamento(maisRecente);
            mostrarEstado("aguardando-devolucao");
            break;
 
        case "concluido":
            if (window.AvaliacoesVizin && window.AvaliacoesVizin.jaAvaliou(maisRecente.id, "locatario")) {
                mostrarEstado("solicitar");
            } else {
                configurarLinksPosPagamento(maisRecente);
                mostrarEstado("concluido");
            }
            break;
 
        case "rejeitado":
            mostrarEstado("rejeitado");
            break;
    }
})();
 
// ================= CANCELAR LOCAÇÃO (antes da retirada) =================
// Disponível pro locatário enquanto a solicitação ainda não chegou na
// retirada: pendente (aguardando aprovação), aprovado (aguardando
// pagamento) ou pago (aguardando retirada). Ver STATUS_CANCELAVEIS em
// solicitacoes-shared.js — a partir da retirada confirmada, o cancelamento
// só deixa de existir por lá (ver Retirada-objeto/retirada-objeto.js).
const modalCancelar = document.getElementById("modal-cancelar");
const modalCancelarVoltar = document.getElementById("modal-cancelar-voltar");
const modalCancelarConfirmar = document.getElementById("modal-cancelar-confirmar");
 
function abrirModalCancelarSolicitacao() {
    if (!idSolicitacaoAtual || !window.SolicitacoesVizin) return;
    modalCancelar.classList.add("show");
}
 
function fecharModalCancelarSolicitacao() {
    modalCancelar.classList.remove("show");
}
 
function confirmarCancelamentoSolicitacao() {
    // PONTO DE INTEGRAÇÃO COM O BACK-END:
    // PATCH /api/solicitacoes/:id { status: "cancelado" }
    window.SolicitacoesVizin.cancelar(idSolicitacaoAtual, usuarioLogado?.email);
 
    clearInterval(intervaloAcompanhamento);
    dadosSolicitacao = null;
    idSolicitacaoAtual = null;
 
    inputRetirada.value = "";
    inputDevolucao.value = "";
    resumoDatas.style.display = "none";
    btnSolicitar.disabled = false;
    btnSolicitar.textContent = "Solicitar Aluguel";
 
    mostrarEstado("solicitar");
    atualizarDisponibilidade();
 
    fecharModalCancelarSolicitacao();
 
    const toast = document.getElementById("toast");
    if (toast) {
        toast.textContent = "Locação cancelada";
        toast.classList.add("show", "sucesso");
        setTimeout(() => toast.classList.remove("show", "sucesso"), 2500);
    }
}
 
document.getElementById("btn-cancelar-pendente")?.addEventListener("click", abrirModalCancelarSolicitacao);
document.getElementById("btn-cancelar-aprovado")?.addEventListener("click", abrirModalCancelarSolicitacao);
document.getElementById("btn-cancelar-pago")?.addEventListener("click", abrirModalCancelarSolicitacao);
 
modalCancelarVoltar?.addEventListener("click", fecharModalCancelarSolicitacao);
modalCancelar?.addEventListener("click", (e) => {
    if (e.target === modalCancelar) fecharModalCancelarSolicitacao();
});
modalCancelarConfirmar?.addEventListener("click", confirmarCancelamentoSolicitacao);
 
// ================= TENTAR NOVAMENTE (após rejeição) =================
document.getElementById("btn-tentar-novamente").addEventListener("click", () => {
    mostrarEstado("solicitar");
    btnSolicitar.disabled = false;
    btnSolicitar.textContent = "Solicitar Aluguel";
    inputRetirada.value = "";
    inputDevolucao.value = "";
    resumoDatas.style.display = "none";
});
 
// ================= IR PARA O PAGAMENTO =================
document.getElementById("btn-ir-pagamento").addEventListener("click", () => {
    if (!dadosSolicitacao) return;
 
    const query = new URLSearchParams({
        produtoId: produto.id,
        retirada: dadosSolicitacao.retirada,
        devolucao: dadosSolicitacao.devolucao,
        solicitacaoId: dadosSolicitacao.id
    });
 
    window.location.href = `../Finalizar-pagamento/index.html?${query.toString()}`;
});
 
document.addEventListener("avaliacoesAtualizadas", () => {
    if (!usuarioLogado?.email || !window.SolicitacoesVizin || !window.AvaliacoesVizin) return;
 
    const maisRecente = SolicitacoesVizin.obterDoSolicitante(usuarioLogado.email)
        .filter(s => s.produtoId === produto.id)
        .sort((a, b) => b.id - a.id)[0];
 
    if (maisRecente?.status === "concluido" && AvaliacoesVizin.jaAvaliou(maisRecente.id, "locatario")) {
        mostrarEstado("solicitar");
    }
});
 
// ================= AVALIAÇÕES DO OBJETO =================
function escaparHTMLProduto(texto) {
    const div = document.createElement('div');
    div.textContent = texto;
    return div.innerHTML;
}
 
function renderizarAvaliacoesProduto() {
    const resumoEl = document.getElementById("produto-avaliacao-resumo");
    const listaEl = document.getElementById("produto-lista-avaliacoes");
    if (!resumoEl || !listaEl || !window.AvaliacoesVizin) return;
 
    const { media, total, lista } = window.AvaliacoesVizin.obterAvaliacoesDoProduto(produto.id);
 
    if (total > 0) {
        const estrelasCheias = Math.round(media);
        let estrelasHTML = "";
        for (let i = 1; i <= 5; i++) {
            estrelasHTML += `<i class="bi ${i <= estrelasCheias ? "bi-star-fill" : "bi-star"}"></i>`;
        }
        resumoEl.innerHTML = `
            <div class="produto-avaliacao-resumo-box">
                <span class="produto-avaliacao-nota-grande">${media.toFixed(1)}</span>
                <div class="produto-avaliacao-resumo-detalhes">
                    <span class="produto-avaliacao-estrelas">${estrelasHTML}</span>
                    <span class="produto-avaliacao-total">${total} avaliação${total > 1 ? "ões" : ""}</span>
                </div>
            </div>
        `;
    } else {
        resumoEl.innerHTML = `<span class="produto-avaliacao-vazio">Ainda sem avaliações</span>`;
    }
 
    listaEl.innerHTML = "";
 
    if (total === 0) {
        listaEl.innerHTML = `<p class="produto-avaliacao-vazio">Este objeto ainda não recebeu avaliações.</p>`;
        return;
    }
 
    lista
        .slice()
        .sort((a, b) => new Date(b.data) - new Date(a.data))
        .forEach(av => {
            const nome = av.nomeAvaliador || "Usuário";
            const nomeSeguro = escaparHTMLProduto(nome);
            const inicial = escaparHTMLProduto(nome.charAt(0).toUpperCase());
 
            // Se soubermos o e-mail de quem avaliou, avatar e nome viram um
            // link pro perfil dessa pessoa — dá pra acessar a conta de quem
            // fez a avaliação direto por aqui.
            const linkPerfilAvaliador = av.emailAvaliador ? `../Perfil/index.html?id=${encodeURIComponent(av.emailAvaliador)}` : null;
 
            const avatarHtml = linkPerfilAvaliador
                ? `<a class="produto-avaliacao-avatar-link" href="${linkPerfilAvaliador}" title="Ver perfil de ${nomeSeguro}"><div class="produto-avaliacao-avatar">${inicial}</div></a>`
                : `<div class="produto-avaliacao-avatar">${inicial}</div>`;
 
            const nomeHtml = linkPerfilAvaliador
                ? `<a class="produto-avaliacao-nome-link" href="${linkPerfilAvaliador}">${nomeSeguro}</a>`
                : `<strong>${nomeSeguro}</strong>`;
 
            const item = document.createElement("div");
            item.className = "produto-avaliacao-item";
            item.innerHTML = `
                <div class="produto-avaliacao-topo">
                    ${avatarHtml}
                    <div class="produto-avaliacao-info">
                        ${nomeHtml}
                        <span class="produto-avaliacao-data">${new Date(av.data).toLocaleDateString("pt-BR")}</span>
                    </div>
                    <div class="produto-avaliacao-nota-item"><i class="bi bi-star-fill"></i> ${av.nota.toFixed(1)}</div>
                </div>
                ${av.comentario ? `<p class="produto-avaliacao-comentario">${escaparHTMLProduto(av.comentario)}</p>` : ""}
            `;
            listaEl.appendChild(item);
        });
}
 
renderizarAvaliacoesProduto();
document.addEventListener("avaliacoesAtualizadas", renderizarAvaliacoesProduto);