// ================= PROTEGER PÁGINA =================
if (!localStorage.getItem("token")) {
    window.location.href = "../Login/index.html";
}

// ================= MOCK DOS MEUS OBJETOS =================
// PONTO DE INTEGRAÇÃO COM O BACK-END:
// Quando o endpoint estiver pronto, troque este array fixo pela
// chamada real, por exemplo:
//
// let meusObjetos = [];
// async function carregarMeusObjetos() {
//     const response = await fetch("/api/objetos/meus", {
//         headers: { "Authorization": `Bearer ${localStorage.getItem("token")}` }
//     });
//     if (!response.ok) throw new Error("Erro ao carregar objetos");
//     meusObjetos = await response.json();
//     renderizarMeusObjetos(meusObjetos);
// }
// carregarMeusObjetos();
//
// O formato esperado de cada objeto no array é o mesmo usado abaixo
// (id, titulo, descricao, categoria, preco_dia, disponivel, imagem, localizacao).

let meusObjetos = [
    {
        id: 1,
        titulo: "Furadeira Profissional Bosch",
        descricao: "Furadeira de impacto profissional, ideal para trabalhos pesados. Inclui maleta e conjunto de brocas.",
        categoria: "Ferramentas",
        preco_dia: 35,
        disponivel: true,
        imagem: "../img/sem-imagem.jpg",
        localizacao: "Campinas, SP"
    },
    {
        id: 2,
        titulo: "Câmera DSLR Canon EOS",
        descricao: "Câmera profissional perfeita para eventos e ensaios fotográficos. Lente 50mm incluída.",
        categoria: "Eletrônicos",
        preco_dia: 120,
        disponivel: true,
        imagem: "../img/sem-imagem.jpg",
        localizacao: "Campinas, SP"
    }
];

// ================= RENDER DOS CARDS =================
const listaContainer = document.getElementById("lista-meus-objetos");
const emptyState = document.getElementById("empty-state");

function renderizarMeusObjetos(lista) {
    if (!listaContainer) return;

    listaContainer.innerHTML = "";

    if (!lista || lista.length === 0) {
        emptyState.style.display = "block";
        return;
    }

    emptyState.style.display = "none";

    lista.forEach(obj => {
        const card = document.createElement("div");
        card.className = "card-objeto";
        card.innerHTML = `
            <img src="${obj.imagem}" alt="${obj.titulo}" class="card-objeto-img">

            <div class="card-objeto-info">
                <h3>${obj.titulo}</h3>
                <p class="descricao">${obj.descricao}</p>

                <div class="tags">
                    <span class="tag tag-categoria">${obj.categoria}</span>
                    <span class="tag tag-preco">R$ ${obj.preco_dia}/dia</span>
                    <span class="tag tag-status ${obj.disponivel ? "" : "indisponivel"}">
                        ${obj.disponivel ? "Disponível" : "Indisponível"}
                    </span>
                </div>

                <div class="card-objeto-actions">
                    <button type="button" class="btn-acao visualizar" data-id="${obj.id}">
                        <i class="bi bi-eye"></i> Visualizar
                    </button>
                    <button type="button" class="btn-acao editar" data-id="${obj.id}">
                        <i class="bi bi-pencil"></i> Editar
                    </button>
                    <button type="button" class="btn-acao excluir" data-id="${obj.id}">
                        <i class="bi bi-trash"></i> Excluir
                    </button>
                </div>
            </div>
        `;
        listaContainer.appendChild(card);
    });
}

renderizarMeusObjetos(meusObjetos);

// ================= MODAL: VISUALIZAR =================
const modalVisualizar = document.getElementById("modal-visualizar");

function abrirModalVisualizar(obj) {
    document.getElementById("modal-visualizar-img").src = obj.imagem;
    document.getElementById("modal-visualizar-titulo").textContent = obj.titulo;
    document.getElementById("modal-visualizar-descricao").textContent = obj.descricao;
    document.getElementById("modal-visualizar-categoria").textContent = obj.categoria;
    document.getElementById("modal-visualizar-preco").textContent = `R$ ${obj.preco_dia}/dia`;

    const statusEl = document.getElementById("modal-visualizar-status");
    statusEl.textContent = obj.disponivel ? "Disponível" : "Indisponível";
    statusEl.classList.toggle("indisponivel", !obj.disponivel);

    document.getElementById("modal-visualizar-localizacao").innerHTML =
        `<i class="bi bi-geo-alt"></i> ${obj.localizacao}`;

    modalVisualizar.classList.add("show");
}

document.getElementById("modal-visualizar-close").addEventListener("click", () => {
    modalVisualizar.classList.remove("show");
});

modalVisualizar.addEventListener("click", (e) => {
    if (e.target === modalVisualizar) modalVisualizar.classList.remove("show");
});

// ================= MODAL: EXCLUIR (CONFIRMAÇÃO) =================
const modalExcluir = document.getElementById("modal-excluir");
let idParaExcluir = null;

function abrirModalExcluir(obj) {
    idParaExcluir = obj.id;
    document.getElementById("modal-excluir-nome").textContent = obj.titulo;
    modalExcluir.classList.add("show");
}

function fecharModalExcluir() {
    idParaExcluir = null;
    modalExcluir.classList.remove("show");
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
        // PONTO DE INTEGRAÇÃO COM O BACK-END:
        // Troque o bloco abaixo pela chamada real assim que o endpoint
        // de exclusão estiver definido, por exemplo:
        //
        // const response = await fetch(`/api/objetos/${idParaExcluir}`, {
        //     method: "DELETE",
        //     headers: { "Authorization": `Bearer ${localStorage.getItem("token")}` }
        // });
        // if (!response.ok) throw new Error("Erro ao excluir objeto");

        meusObjetos = meusObjetos.filter(obj => obj.id !== idParaExcluir);
        renderizarMeusObjetos(meusObjetos);
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

    if (btnVisualizar) {
        const obj = meusObjetos.find(o => o.id == btnVisualizar.dataset.id);
        if (obj) abrirModalVisualizar(obj);
        return;
    }

    if (btnEditar) {
    window.location.href = `editar-objeto.html?id=${btnEditar.dataset.id}`;
    return;
}

    if (btnExcluir) {
        const obj = meusObjetos.find(o => o.id == btnExcluir.dataset.id);
        if (obj) abrirModalExcluir(obj);
        return;
    }
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