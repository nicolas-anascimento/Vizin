// MENU MOBILE
const menuToggle = document.getElementById('menu-toggle');
const nav = document.querySelector('nav');

menuToggle.addEventListener('click', () => {
    nav.classList.toggle('active');
});

// ================= LOGIN CHECK =================
function estaLogado() {
    return localStorage.getItem("token");
}

// ================= BLOQUEAR AÇÕES =================
const btnAdicionar = document.querySelector('.btn-adicionar');

btnAdicionar.addEventListener('click', () => {
    if (!estaLogado()) {
        alert("Você precisa estar logado!");
        window.location.href = "login.html";
    }
});

// links protegidos
document.querySelectorAll('.protegido').forEach(link => {
    link.addEventListener('click', (e) => {
        if (!estaLogado()) {
            e.preventDefault();
            alert("Faça login para acessar");
        }
    });
});

// ================= MOCK (DADOS FAKE) =================
const mockObjetos = [
    { nome: "Furadeira", categoria: "ferramentas", localizacao: "Sorocaba" },
    { nome: "Barraca", categoria: "camping", localizacao: "Votorantim" },
    { nome: "Bola", categoria: "esportes", localizacao: "Sorocaba" },
    { nome: "Caixa de som", categoria: "eletronicos", localizacao: "Itu" }
];

// ================= BUSCA =================
const inputBusca = document.getElementById('inputBusca');
const inputLocal = document.getElementById('inputLocal');
const selectCategoria = document.getElementById('selectCategoria');

function buscarObjetos() {
    const busca = inputBusca.value.toLowerCase();
    const local = inputLocal.value.toLowerCase();
    const categoria = selectCategoria.value;

    const filtrados = mockObjetos.filter(obj => {
        return (
            obj.nome.toLowerCase().includes(busca) &&
            obj.localizacao.toLowerCase().includes(local) &&
            (categoria === "" || obj.categoria === categoria)
        );
    });

    renderizarObjetos(filtrados);
}

// debounce
let timeout;
function debounceBusca() {
    clearTimeout(timeout);
    timeout = setTimeout(buscarObjetos, 400);
}

// eventos
inputBusca.addEventListener('input', debounceBusca);
inputLocal.addEventListener('input', debounceBusca);
selectCategoria.addEventListener('change', buscarObjetos);

// ================= RENDER =================
function renderizarObjetos(lista) {
    const container = document.getElementById('lista-objetos');
    container.innerHTML = "";

    if (lista.length === 0) {
        container.innerHTML = "<p>Nenhum objeto encontrado</p>";
        return;
    }

    lista.forEach(obj => {
        container.innerHTML += `
    <div class="card-produto">

        <div class="card-img-container">
            <img src="${obj.imagem || 'img/sem-imagem.jpg'}" class="card-img">

            <span class="categoria">${obj.categoria}</span>
            <span class="preco">R$ ${obj.preco}/dia</span>
        </div>

        <div class="card-body">
            <h3>${obj.nome}</h3>
            <p class="localizacao">
                <i class="bi bi-geo-alt"></i> ${obj.localizacao}
            </p>
            <hr>
            <div class="card-footer">
                <span class="card-rating">⭐ ${obj.media || 4.9}</span>

                <a href="produto.html?id=${obj.id}" class="saiba-mais" onclick="event.stopPropagation()">
                    Saiba mais <i class="bi bi-arrow-right"></i>
                </a>

            </div>
        </div>

    </div>
`;
    });
}

// carregar inicial
buscarObjetos();