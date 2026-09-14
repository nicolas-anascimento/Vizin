// ================= PROTEGER PÁGINA =================
if (!localStorage.getItem("token")) {
 
    // Mesmo padrão usado na Início: guarda o motivo pra tela de Login
    // mostrar, já que o redirecionamento aqui é imediato.
    sessionStorage.setItem(
        "mensagemLogin",
        "Você precisa estar logado para acessar essa página."
    );
 
    window.location.href = "../Login/index.html";
 
}
 
// Protegido contra JSON corrompido em localStorage.usuario — sem isso, um
// JSON.parse quebrado derrubava o script inteiro e a página nem renderizava.
let usuarioLogado = null;
 
try {
 
    usuarioLogado = JSON.parse(localStorage.getItem("usuario") || "null");
 
} catch (erro) {
 
    console.error("Dados de usuário corrompidos no localStorage:", erro);
    localStorage.removeItem("usuario");
 
}
 
// ================= RENDER DOS CARDS =================
const listaContainer = document.getElementById("lista-meus-objetos");
const emptyState = document.getElementById("empty-state");
 
function carregarMeusObjetos() {
    // PONTO DE INTEGRAÇÃO COM O BACK-END:
    // GET /api/objetos?proprietarioId=... (autenticado)
    if (!usuarioLogado?.email || !window.ObjetosVizin) return [];
    return window.ObjetosVizin.obterDoProprietario(usuarioLogado.email);
}
 
// ================= CARD DE OBJETO (via DOM, não innerHTML) =================
// Monta o card criando elementos e usando textContent para todo dado vindo
// do objeto (título, descrição, categoria, imagem). Evita que esses campos
// precisem ser escapados manualmente — a versão anterior inseria isso tudo
// via template string dentro de innerHTML, sem escapar nada (mesma brecha
// que corrigimos na página Início: uma URL de imagem maliciosa, por
// exemplo, quebraria o atributo src).
function criarCardMeuObjeto(obj) {
 
    const imagemPrincipal = (obj.imagens && obj.imagens.length) ? obj.imagens[0] : obj.imagem;
    const emLocacao = window.ObjetosVizin.temLocacaoAtiva(obj.id);
 
    // Solicitação ainda não respondida pelo dono: mais branda que uma
    // locação ativa (o dono ainda pode recusar o pedido), mas trava editar
    // e excluir do mesmo jeito — mudar preço/disponibilidade ou apagar o
    // objeto agora faria o interessado ver dados diferentes dos que pediu,
    // ou deixaria a solicitação dele órfã.
    const temPendente = window.ObjetosVizin.temSolicitacaoPendente(obj.id);
    const bloqueado = emLocacao || temPendente;
 
    const card = document.createElement("div");
    card.className = "card-objeto";
 
    // -- imagem --
    const img = document.createElement("img");
    img.src = imagemPrincipal;
    img.alt = obj.titulo;
    img.className = "card-objeto-img";
 
    img.addEventListener("error", function aoFalhar() {
        img.removeEventListener("error", aoFalhar);
        img.src = "../img/sem-imagem.jpg";
    });
 
    card.appendChild(img);
 
    // -- info --
    const info = document.createElement("div");
    info.className = "card-objeto-info";
 
    const titulo = document.createElement("h3");
    titulo.textContent = obj.titulo;
    info.appendChild(titulo);
 
    const descricao = document.createElement("p");
    descricao.className = "descricao";
    descricao.textContent = obj.descricao;
    info.appendChild(descricao);
 
    const tags = document.createElement("div");
    tags.className = "tags";
 
    const tagCategoria = document.createElement("span");
    tagCategoria.className = "tag tag-categoria";
    tagCategoria.textContent = obj.categoria;
    tags.appendChild(tagCategoria);
 
    const tagPreco = document.createElement("span");
    tagPreco.className = "tag tag-preco";
    tagPreco.textContent = `${formatarPreco(obj.preco_dia)}/dia`;
    tags.appendChild(tagPreco);
 
    info.appendChild(tags);
 
    // -- toggle de disponibilidade --
    const toggleWrap = document.createElement("div");
    toggleWrap.className = "disponibilidade-toggle";
 
    const label = document.createElement("label");
    label.className = "switch";
    if (bloqueado) {
        label.title = emLocacao
            ? "Não é possível alterar durante uma locação em andamento"
            : "Não é possível alterar enquanto houver uma solicitação pendente — responda antes";
    }
 
    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.className = "toggle-disponivel";
    checkbox.dataset.id = obj.id;
    checkbox.dataset.motivo = emLocacao ? "locacao" : (temPendente ? "pendente" : "");
    checkbox.checked = !!obj.disponivel;
    checkbox.disabled = bloqueado;
 
    const slider = document.createElement("span");
    slider.className = "slider";
 
    label.appendChild(checkbox);
    label.appendChild(slider);
    toggleWrap.appendChild(label);
 
    const dispLabel = document.createElement("span");
    dispLabel.className = obj.disponivel
        ? "disponibilidade-label"
        : "disponibilidade-label indisponivel";
    dispLabel.textContent = emLocacao
        ? "Em locação"
        : (temPendente ? "Solicitação pendente" : (obj.disponivel ? "Disponível" : "Pausado pelo dono"));
    toggleWrap.appendChild(dispLabel);
 
    info.appendChild(toggleWrap);
 
    // -- ações --
    // Editar/Excluir NÃO usam o atributo disabled quando bloqueados: um
    // botão disabled não dispara clique nem aceita toque, então no celular
    // (sem hover pra mostrar o title) o usuário não teria nenhuma pista do
    // motivo. Em vez disso, ficam com a aparência "desabilitada" (classe
    // .bloqueado) mas continuam clicáveis, e o clique explica o motivo via
    // toast — funciona igual em mouse, teclado e toque.
    const actions = document.createElement("div");
    actions.className = "card-objeto-actions";
 
    const btnVisualizar = document.createElement("button");
    btnVisualizar.type = "button";
    btnVisualizar.className = "btn-acao visualizar";
    btnVisualizar.dataset.id = obj.id;
    btnVisualizar.innerHTML = '<i class="bi bi-eye"></i> ';
    btnVisualizar.append("Visualizar");
    actions.appendChild(btnVisualizar);
 
    const btnEditar = document.createElement("button");
    btnEditar.type = "button";
    btnEditar.className = bloqueado ? "btn-acao editar bloqueado" : "btn-acao editar";
    btnEditar.dataset.id = obj.id;
    if (bloqueado) {
        btnEditar.dataset.motivo = emLocacao ? "locacao" : "pendente";
        btnEditar.title = emLocacao
            ? "Não é possível editar um objeto em locação no momento"
            : "Não é possível editar um objeto com solicitação pendente — responda a solicitação antes";
        btnEditar.setAttribute("aria-disabled", "true");
    }
    btnEditar.innerHTML = '<i class="bi bi-pencil"></i> ';
    btnEditar.append("Editar");
    actions.appendChild(btnEditar);
 
    const btnExcluir = document.createElement("button");
    btnExcluir.type = "button";
    btnExcluir.className = bloqueado ? "btn-acao excluir bloqueado" : "btn-acao excluir";
    btnExcluir.dataset.id = obj.id;
    if (bloqueado) {
        btnExcluir.title = emLocacao
            ? "Não é possível excluir um objeto em locação no momento"
            : "Não é possível excluir um objeto com solicitação pendente — responda a solicitação antes";
        btnExcluir.setAttribute("aria-disabled", "true");
    }
    btnExcluir.innerHTML = '<i class="bi bi-trash"></i> ';
    btnExcluir.append("Excluir");
    actions.appendChild(btnExcluir);
 
    info.appendChild(actions);
 
    card.appendChild(info);
 
    return card;
 
}
 
function renderizarMeusObjetos() {
    if (!listaContainer) return;
 
    const lista = carregarMeusObjetos();
    listaContainer.innerHTML = "";
 
    if (!lista || lista.length === 0) {
        emptyState.style.display = "block";
        return;
    }
 
    emptyState.style.display = "none";
 
    lista.forEach(obj => {
        listaContainer.appendChild(criarCardMeuObjeto(obj));
    });
}
 
renderizarMeusObjetos();
 
// Atualiza sozinho se um objeto ou solicitação mudar de estado enquanto
// esta ABA estiver aberta (ex: aprovação acontecendo em outro componente
// da mesma página).
document.addEventListener("objetosAtualizados", renderizarMeusObjetos);
document.addEventListener("solicitacoesAtualizadas", renderizarMeusObjetos);
 
// O CustomEvent acima só é ouvido dentro do mesmo documento — ele NÃO
// atravessa abas/janelas diferentes do navegador. Pra cobrir o caso de
// "aprovei uma solicitação na aba de Notificações enquanto Meus Objetos
// está aberto em outra aba", escutamos também o evento nativo "storage",
// que o navegador dispara em outras abas quando o localStorage muda.
// (ajuste as chaves abaixo se o módulo de solicitações usar um nome
// diferente de "solicitacoes" no localStorage)
window.addEventListener("storage", (e) => {
    if (!e.key || e.key === "objetos" || e.key === "solicitacoes") {
        renderizarMeusObjetos();
    }
});
 
// ================= MODAIS: HELPERS DE ABRIR/FECHAR (Esc + foco preso) =================
// Compartilhado pelos três modais desta página. Sem isso, quem navega por
// teclado consegue "vazar" o Tab pro conteúdo atrás do modal, e não existe
// jeito de fechar sem clicar exatamente no X ou fora da caixa.
let modalAtualAberto = null;
 
function obterFocaveis(modalBox) {
    return Array.from(modalBox.querySelectorAll(
        'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
    ));
}
 
function abrirModal(overlayEl) {
    modalAtualAberto = overlayEl;
    overlayEl.classList.add("show");
 
    const box = overlayEl.querySelector(".modal-box");
    const focaveis = box ? obterFocaveis(box) : [];
    if (focaveis.length) focaveis[0].focus();
}
 
function fecharModalGenerico(overlayEl) {
    overlayEl.classList.remove("show");
    if (modalAtualAberto === overlayEl) modalAtualAberto = null;
}
 
document.addEventListener("keydown", (e) => {
    if (!modalAtualAberto) return;
 
    if (e.key === "Escape") {
        // Reaproveita o fechamento específico do modal de exclusão (que
        // também limpa o id pendente), senão usa o genérico.
        if (modalAtualAberto.id === "modal-excluir") {
            fecharModalExcluir();
        } else {
            fecharModalGenerico(modalAtualAberto);
        }
        return;
    }
 
    if (e.key === "Tab") {
        const box = modalAtualAberto.querySelector(".modal-box");
        const focaveis = box ? obterFocaveis(box) : [];
        if (!focaveis.length) return;
 
        const primeiro = focaveis[0];
        const ultimo = focaveis[focaveis.length - 1];
 
        if (e.shiftKey && document.activeElement === primeiro) {
            e.preventDefault();
            ultimo.focus();
        } else if (!e.shiftKey && document.activeElement === ultimo) {
            e.preventDefault();
            primeiro.focus();
        }
    }
});
 
// ================= MODAL: VISUALIZAR =================
const modalVisualizar = document.getElementById("modal-visualizar");
 
let modalImagens = [];
let modalIndex = 0;
let objVisualizadoAtual = null; // guarda o objeto aberto, usado pelo botão "Ver Avaliações"
 
// Cria as setas/contador do modal na primeira vez que ele é aberto.
// Usa as MESMAS classes CSS (.galeria-seta / .galeria-contador) do
// mini-carrossel dos cards, pra ficar visualmente idêntico. A imagem é
// envolvida num wrapper próprio (só com a altura da foto) pra que
// "top:50%" das setas se posicione relativo à foto, e não ao card inteiro
// (que engloba título, descrição, tags etc).
function garantirControlesGaleriaModal() {
    if (document.getElementById("modal-visualizar-prev")) return;
 
    const imgEl = document.getElementById("modal-visualizar-img");
 
    let wrapper = document.getElementById("modal-visualizar-img-wrapper");
    if (!wrapper) {
        wrapper = document.createElement("div");
        wrapper.id = "modal-visualizar-img-wrapper";
        wrapper.className = "modal-visualizar-img-wrapper";
        imgEl.parentElement.insertBefore(wrapper, imgEl);
        wrapper.appendChild(imgEl);
    }
 
    const prevBtn = document.createElement("button");
    prevBtn.type = "button";
    prevBtn.id = "modal-visualizar-prev";
    prevBtn.className = "galeria-seta prev";
    prevBtn.setAttribute("aria-label", "Foto anterior");
    prevBtn.innerHTML = "&lsaquo;";
 
    const nextBtn = document.createElement("button");
    nextBtn.type = "button";
    nextBtn.id = "modal-visualizar-next";
    nextBtn.className = "galeria-seta next";
    nextBtn.setAttribute("aria-label", "Próxima foto");
    nextBtn.innerHTML = "&rsaquo;";
 
    const contador = document.createElement("span");
    contador.id = "modal-visualizar-contador";
    contador.className = "galeria-contador";
 
    wrapper.appendChild(prevBtn);
    wrapper.appendChild(nextBtn);
    wrapper.appendChild(contador);
 
    prevBtn.addEventListener("click", () => navegarGaleriaModal(-1));
    nextBtn.addEventListener("click", () => navegarGaleriaModal(1));
}
 
function navegarGaleriaModal(delta) {
    if (modalImagens.length <= 1) return;
    modalIndex = (modalIndex + delta + modalImagens.length) % modalImagens.length;
    atualizarImagemModal();
}
 
function atualizarImagemModal() {
    document.getElementById("modal-visualizar-img").src = modalImagens[modalIndex];
 
    const multiplo = modalImagens.length > 1;
    const prevBtn = document.getElementById("modal-visualizar-prev");
    const nextBtn = document.getElementById("modal-visualizar-next");
    const contador = document.getElementById("modal-visualizar-contador");
 
    if (prevBtn) prevBtn.style.display = multiplo ? "flex" : "none";
    if (nextBtn) nextBtn.style.display = multiplo ? "flex" : "none";
    if (contador) {
        contador.style.display = multiplo ? "block" : "none";
        contador.textContent = `${modalIndex + 1}/${modalImagens.length}`;
    }
}
 
function abrirModalVisualizar(obj) {
    garantirControlesGaleriaModal();
 
    objVisualizadoAtual = obj;
    modalImagens = (obj.imagens && obj.imagens.length) ? obj.imagens : [obj.imagem];
    modalIndex = 0;
    atualizarImagemModal();
 
    document.getElementById("modal-visualizar-titulo").textContent = obj.titulo;
    document.getElementById("modal-visualizar-descricao").textContent = obj.descricao;
    document.getElementById("modal-visualizar-categoria").textContent = obj.categoria;
    document.getElementById("modal-visualizar-preco").textContent = `${formatarPreco(obj.preco_dia)}/dia`;
 
    const statusEl = document.getElementById("modal-visualizar-status");
    statusEl.textContent = obj.disponivel ? "Disponível" : "Indisponível";
    statusEl.classList.toggle("indisponivel", !obj.disponivel);
 
    // obj.localizacao inserido via append() (texto puro), não innerHTML
    // com template string — evita o mesmo tipo de brecha corrigida no card.
    const localEl = document.getElementById("modal-visualizar-localizacao");
    localEl.innerHTML = '<i class="bi bi-geo-alt"></i> ';
    localEl.append(obj.localizacao);
 
    abrirModal(modalVisualizar);
}
 
document.getElementById("modal-visualizar-close").addEventListener("click", () => {
    fecharModalGenerico(modalVisualizar);
});
 
modalVisualizar.addEventListener("click", (e) => {
    if (e.target === modalVisualizar) fecharModalGenerico(modalVisualizar);
});
 
// ================= MODAL: AVALIAÇÕES DO OBJETO =================
const modalAvaliacoes = document.getElementById("modal-avaliacoes");
 
function escaparHTMLMeusObjetos(texto) {
    const div = document.createElement("div");
    div.textContent = texto;
    return div.innerHTML;
}
 
function abrirModalAvaliacoes(obj) {
    if (!obj || !window.AvaliacoesVizin) return;
 
    document.getElementById("modal-avaliacoes-titulo-objeto").textContent = obj.titulo;
 
    const resumoEl = document.getElementById("modal-avaliacoes-resumo");
    const listaEl = document.getElementById("modal-avaliacoes-lista");
 
    const { media, total, lista } = window.AvaliacoesVizin.obterAvaliacoesDoProduto(obj.id);
 
    if (total > 0) {
        const estrelasCheias = Math.round(media);
        let estrelasHTML = "";
        for (let i = 1; i <= 5; i++) {
            estrelasHTML += `<i class="bi ${i <= estrelasCheias ? "bi-star-fill" : "bi-star"}"></i>`;
        }
        resumoEl.innerHTML = `
            <div class="avaliacoes-resumo-box">
                <span class="avaliacoes-resumo-nota">${media.toFixed(1)}</span>
                <div class="avaliacoes-resumo-detalhes">
                    <span class="avaliacoes-resumo-estrelas">${estrelasHTML}</span>
                    <span class="avaliacoes-resumo-total">${total} avaliação${total > 1 ? "ões" : ""}</span>
                </div>
            </div>
        `;
    } else {
        resumoEl.innerHTML = "";
    }
 
    listaEl.innerHTML = "";
 
    if (total === 0) {
        listaEl.innerHTML = `<p class="avaliacoes-vazio">Este objeto ainda não recebeu avaliações.</p>`;
    } else {
        lista
            .slice()
            .sort((a, b) => new Date(b.data) - new Date(a.data))
            .forEach(av => {
                const nome = av.nomeAvaliador || "Usuário";
                const inicial = nome.charAt(0).toUpperCase();
 
                const item = document.createElement("div");
                item.className = "avaliacao-modal-item";
                item.innerHTML = `
                    <div class="avaliacao-modal-topo">
                        <div class="avaliacao-modal-avatar">${escaparHTMLMeusObjetos(inicial)}</div>
                        <div class="avaliacao-modal-info">
                            <strong>${escaparHTMLMeusObjetos(nome)}</strong>
                            <span class="avaliacao-modal-data">${new Date(av.data).toLocaleDateString("pt-BR")}</span>
                        </div>
                        <div class="avaliacao-modal-nota"><i class="bi bi-star-fill"></i> ${av.nota.toFixed(1)}</div>
                    </div>
                    ${av.comentario ? `<p class="avaliacao-modal-comentario">${escaparHTMLMeusObjetos(av.comentario)}</p>` : ""}
                `;
                listaEl.appendChild(item);
            });
    }
 
    abrirModal(modalAvaliacoes);
}
 
document.getElementById("modal-visualizar-ver-avaliacoes").addEventListener("click", () => {
    if (objVisualizadoAtual) abrirModalAvaliacoes(objVisualizadoAtual);
});
 
document.getElementById("modal-avaliacoes-close").addEventListener("click", () => {
    fecharModalGenerico(modalAvaliacoes);
});
 
modalAvaliacoes.addEventListener("click", (e) => {
    if (e.target === modalAvaliacoes) fecharModalGenerico(modalAvaliacoes);
});
 
// Se uma avaliação for criada/atualizada em outra aba (ex: alguém avaliou o
// objeto na página de Avaliação) enquanto a modal de avaliações estiver
// aberta, atualiza o conteúdo dela na hora, sem precisar reabrir.
document.addEventListener("avaliacoesAtualizadas", () => {
    if (modalAvaliacoes.classList.contains("show") && objVisualizadoAtual) {
        abrirModalAvaliacoes(objVisualizadoAtual);
    }
});
 
// ================= MODAL: EXCLUIR (CONFIRMAÇÃO) =================
const modalExcluir = document.getElementById("modal-excluir");
let idParaExcluir = null;
 
function abrirModalExcluir(obj) {
    // Trava de verdade: só bloqueia exclusão se houver locação realmente
    // ativa (aprovado/pago/retirado/aguardando_devolucao). Um objeto só
    // "pausado" pelo dono (disponivel: false, sem solicitação ativa) pode
    // ser excluído normalmente.
    if (window.ObjetosVizin.temLocacaoAtiva(obj.id)) {
        mostrarToast("Não é possível excluir um objeto em locação no momento", "erro");
        return;
    }
 
    // Também bloqueia se existe uma solicitação PENDENTE (ainda não
    // respondida): excluir agora deixaria essa solicitação órfã, apontando
    // pra um objeto que não existe mais na tela de quem pediu.
    if (window.ObjetosVizin.temSolicitacaoPendente(obj.id)) {
        mostrarToast("Você tem uma solicitação pendente para este objeto — responda antes de excluir", "erro");
        return;
    }
 
    idParaExcluir = obj.id;
    document.getElementById("modal-excluir-nome").textContent = obj.titulo;
    abrirModal(modalExcluir);
}
 
function fecharModalExcluir() {
    idParaExcluir = null;
    fecharModalGenerico(modalExcluir);
}
 
document.getElementById("modal-excluir-cancelar").addEventListener("click", fecharModalExcluir);
 
modalExcluir.addEventListener("click", (e) => {
    if (e.target === modalExcluir) fecharModalExcluir();
});
 
document.getElementById("modal-excluir-confirmar").addEventListener("click", async () => {
    if (idParaExcluir === null) return;
 
    const btnConfirmar = document.getElementById("modal-excluir-confirmar");
    btnConfirmar.disabled = true;
    btnConfirmar.textContent = "Excluindo...";
 
    try {
        // PONTO DE INTEGRAÇÃO COM O BACK-END: DELETE /api/objetos/:id
        window.ObjetosVizin.excluir(idParaExcluir);
        renderizarMeusObjetos();
        mostrarToast("Objeto excluído com sucesso");
    } catch (err) {
        console.error(err);
        mostrarToast("Não foi possível excluir o objeto", "erro");
    } finally {
        btnConfirmar.disabled = false;
        btnConfirmar.textContent = "Excluir";
        fecharModalExcluir();
    }
});
 
// ================= AÇÕES DOS CARDS (delegação de eventos) =================
listaContainer.addEventListener("click", (e) => {
    const btnVisualizar = e.target.closest(".btn-acao.visualizar");
    const btnEditar = e.target.closest(".btn-acao.editar");
    const btnExcluir = e.target.closest(".btn-acao.excluir");
    const toggleWrap = e.target.closest(".disponibilidade-toggle");
 
    if (btnVisualizar) {
        const obj = window.ObjetosVizin.obterPorId(btnVisualizar.dataset.id);
        if (obj) abrirModalVisualizar(obj);
        return;
    }
 
    if (btnEditar) {
        if (btnEditar.classList.contains("bloqueado")) {
            mostrarToast(
                btnEditar.dataset.motivo === "pendente"
                    ? "Não é possível editar um objeto com solicitação pendente — responda antes"
                    : "Não é possível editar um objeto em locação no momento",
                "erro"
            );
            return;
        }
        window.location.href = `../Editar-objeto/index.html?id=${btnEditar.dataset.id}`;
        return;
    }
 
    if (btnExcluir) {
        const obj = window.ObjetosVizin.obterPorId(btnExcluir.dataset.id);
        if (obj) abrirModalExcluir(obj);
        return;
    }
 
    // Toque/clique no toggle de disponibilidade quando ele está travado
    // (locação ativa): o checkbox disabled não reage a toque no celular
    // (sem hover pro title aparecer), então avisamos por toast também.
    if (toggleWrap) {
        const chk = toggleWrap.querySelector(".toggle-disponivel");
        if (chk && chk.disabled) {
            mostrarToast(
                chk.dataset.motivo === "pendente"
                    ? "Não é possível alterar a disponibilidade enquanto houver uma solicitação pendente"
                    : "Não é possível alterar a disponibilidade durante uma locação em andamento",
                "erro"
            );
        }
        return;
    }
});
 
// Toggle de disponibilidade — o "depois" que faltava pro dono conseguir
// pausar/reativar o anúncio sem precisar entrar em Editar Objeto.
listaContainer.addEventListener("change", (e) => {
    const toggle = e.target.closest(".toggle-disponivel");
    if (!toggle) return;
 
    const id = toggle.dataset.id;
    const novoValor = toggle.checked;
 
    // PONTO DE INTEGRAÇÃO COM O BACK-END: PATCH /api/objetos/:id { disponivel }
    window.ObjetosVizin.marcarDisponibilidade(id, novoValor);
    mostrarToast(novoValor ? "Objeto disponível para aluguel" : "Objeto pausado — não aparecerá para locação");
    renderizarMeusObjetos();
});
 
// ================= TOAST =================
function mostrarToast(mensagem, tipo = "sucesso") {
    const toast = document.getElementById("toast");
    if (!toast) return;
 
    toast.innerText = mensagem;
    toast.className = `toast show ${tipo}`;
 
    setTimeout(() => {
        toast.classList.remove("show");
    }, 2500);
}
 