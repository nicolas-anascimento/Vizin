// ================= MENU MOBILE =================
const menuToggle = document.getElementById('menu-toggle');
const nav = document.querySelector('nav');

if (menuToggle && nav) {

    menuToggle.addEventListener('click', () => {

        nav.classList.toggle('active');

    });

}

// ================= BOTÃO ANUNCIAR =================
const btnAdicionar = document.querySelector('.btn-adicionar');

if (btnAdicionar) {

    btnAdicionar.addEventListener('click', () => {

        window.location.href = "cadastrar-objeto.html";

    });

}

// ================= MOCK DOS PRODUTOS =================
const mockObjetos = [

    {
        id: 1,
        nome: "Furadeira Bosch",
        descricao: "Furadeira profissional para serviços domésticos.",
        categoria: "ferramentas",
        preco: 25,
        localizacao: "Sorocaba",
        media: 4.9,
        imagem: "/assets/img/sem-imagem.jpg"
    },

    {
        id: 2,
        nome: "Caixa JBL",
        descricao: "Caixa de som bluetooth portátil.",
        categoria: "eletronicos",
        preco: 40,
        localizacao: "Campinas",
        media: 4.8,
        imagem: "/assets/img/sem-imagem.jpg"
    },

    {
        id: 3,
        nome: "Barraca Camping",
        descricao: "Barraca para 4 pessoas.",
        categoria: "camping",
        preco: 35,
        localizacao: "Hortolândia",
        media: 4.7,
        imagem: "/assets/img/sem-imagem.jpg"
    },

    {
        id: 4,
        nome: "Bicicleta",
        descricao: "Bike aro 29 para trilhas.",
        categoria: "transportes",
        preco: 50,
        localizacao: "Monte Mor",
        media: 5.0,
        imagem: "/assets/img/sem-imagem.jpg"
    }

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

// ================= COPIAR EMAIL =================
const email = document.getElementById("emailEmpresa");

if (email) {

    email.addEventListener("click", () => {

        const texto = email.innerText;

        navigator.clipboard.writeText(texto)

            .then(() => {

                mostrarToast("📧 Email copiado ✔");

            })

            .catch(() => {

                mostrarToast("Erro ao copiar ❌", "erro");

            });

    });

}

// ================= BOAS VINDAS =================
const boasVindas = document.getElementById("boasVindas");

const usuario = JSON.parse(localStorage.getItem("usuario") || "null");

if (usuario && boasVindas) {

    boasVindas.innerHTML = `
        👋 Bem-vindo(a), <strong>${usuario.nome}</strong>
    `;

}

// ================= LOGOUT =================
const btnLogout = document.getElementById("btnLogout");

if (btnLogout) {

    btnLogout.addEventListener("click", () => {

        localStorage.removeItem("token");
        localStorage.removeItem("usuario");

        mostrarToast("Você saiu da conta ✔");

        setTimeout(() => {

            window.location.href = "login.html";

        }, 1000);

    });

}
