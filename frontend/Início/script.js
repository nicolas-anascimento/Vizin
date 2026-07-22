
// ================= PROTEGER HOME =================
if (!localStorage.getItem("token")) {
 
    window.location.href = "../login/index.html";
 
}
 
// ================= BOTÃO ANUNCIAR =================
const btnAdicionar = document.querySelector('.btn-adicionar');
 
if (btnAdicionar) {
 
    btnAdicionar.addEventListener('click', () => {
 
        window.location.href = "../Cadastrar-objeto/index.html";
 
    });
 
}
 
// ================= BUSCA =================
const inputBusca = document.getElementById('inputBusca');
const inputLocal = document.getElementById('inputLocal');
const selectCategoria = document.getElementById('selectCategoria');
 
/* ============================================================
   PONTO DE INTEGRAÇÃO COM O BACK-END
   GET /api/objetos?busca=&local=&categoria=
   Todos os parâmetros são opcionais. Resposta esperada: um
   array de objetos no formato:
   {
     id, nome, descricao, categoria, preco, localizacao,
     media, imagem
   }
   ============================================================ */
async function buscarObjetos() {
 
    const busca = inputBusca ? inputBusca.value.trim() : "";
    const local = inputLocal ? inputLocal.value.trim() : "";
    const categoria = selectCategoria ? selectCategoria.value : "";
 
    const query = new URLSearchParams();
    if (busca) query.set("busca", busca);
    if (local) query.set("local", local);
    if (categoria) query.set("categoria", categoria);
 
    try {
        const response = await fetch(`/api/objetos?${query.toString()}`, {
            headers: {
                "Authorization": `Bearer ${localStorage.getItem("token")}`
            }
        });
 
        if (!response.ok) {
            throw new Error(`Erro ${response.status} ao buscar objetos`);
        }
 
        const objetos = await response.json();
        renderizarObjetos(objetos);
 
    } catch (err) {
        console.error(err);
        renderizarErro();
    }
 
}
 
// ================= DEBOUNCE =================
let timeout;
 
function debounceBusca() {
 
    clearTimeout(timeout);
 
    timeout = setTimeout(() => {
 
        buscarObjetos();
 
    }, 400);
 
}
 
// ================= EVENTOS =================
if (inputBusca) {
 
    inputBusca.addEventListener('input', debounceBusca);
 
}
 
if (inputLocal) {
 
    inputLocal.addEventListener('input', debounceBusca);
 
}
 
if (selectCategoria) {
 
    selectCategoria.addEventListener('change', buscarObjetos);
 
}
 
// ================= RENDER DOS PRODUTOS =================
function renderizarObjetos(lista) {
 
    const container = document.getElementById('lista-objetos');
 
    if (!container) return;
 
    container.innerHTML = "";
 
    // sem resultados
    if (lista.length === 0) {
 
        container.innerHTML = `
 
            <div class="sem-resultado">
 
                <i class="bi bi-search"></i>
 
                <p>Nenhum objeto encontrado</p>
 
            </div>
 
        `;
 
        return;
 
    }
 
    // renderizar cards
    lista.forEach(obj => {
 
        container.innerHTML += `
 
            <div class="card-produto"
                 onclick="window.location.href='produto.html?id=${obj.id}'">
 
                <div class="card-img-container">
 
                    <img 
                        src="${obj.imagem}" 
                        alt="${obj.nome}" 
                        class="card-img"
                    >
 
                    <span class="categoria">
                        ${obj.categoria}
                    </span>
 
                    <span class="preco">
                        R$ ${obj.preco}/dia
                    </span>
 
                </div>
 
                <div class="card-body">
 
                    <h3>${obj.nome}</h3>
 
                    <p class="localizacao">
                        <i class="bi bi-geo-alt"></i>
                        ${obj.localizacao}
                    </p>
 
                    <hr>
 
                    <div class="card-footer">
 
                        <span class="card-rating">
                            ⭐ ${obj.media}
                        </span>
 
                        <a 
                            href="produto.html?id=${obj.id}" 
                            class="saiba-mais"
                            onclick="event.stopPropagation()"
                        >
                            Saiba mais
                            <i class="bi bi-arrow-right"></i>
                        </a>
 
                    </div>
 
                </div>
 
            </div>
 
        `;
 
    });
 
}
 
function renderizarErro() {
 
    const container = document.getElementById('lista-objetos');
 
    if (!container) return;
 
    container.innerHTML = `
 
        <div class="sem-resultado">
 
            <i class="bi bi-exclamation-triangle"></i>
 
            <p>Não foi possível carregar os objetos. Tente novamente.</p>
 
        </div>
 
    `;
 
}
 
// ================= LOAD INICIAL =================
buscarObjetos();
 
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
 
// ================= BOAS VINDAS =================
const boasVindas = document.getElementById("boasVindas");
 
const usuario = JSON.parse(localStorage.getItem("usuario") || "null");
 
if (usuario && boasVindas) {
 
    boasVindas.innerHTML = `
        👋 Bem-vindo(a), <strong>${usuario.nome}</strong>
    `;
 
}
 