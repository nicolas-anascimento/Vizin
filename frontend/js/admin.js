// ================= VERIFICAR ADMIN =================
const usuario = JSON.parse(localStorage.getItem("usuario"));

if (!usuario || usuario.tipo !== "admin") {

    window.location.href = "home.html";

}

// ================= MOSTRAR NOME =================
const adminLogado = document.getElementById("adminLogado");

if (adminLogado && usuario) {

    adminLogado.innerHTML = `
        <i class="bi bi-person-circle"></i>
        <div class="block">
            Olá, ${usuario.nome}
        <span>ADMINISTRADOR</span>
        </div>
    `;

}

// ================= LOGOUT =================
const btnLogout = document.getElementById("btnLogout");

if (btnLogout) {

    btnLogout.addEventListener("click", () => {

        localStorage.removeItem("token");
        localStorage.removeItem("usuario");

        window.location.href = "/login";

    });

}

const usuariosMock = [

{
    id: 1,
    nome: "João Silva",
    email: "joao@email.com",
    cpf: "123.456.789-00",
    telefone: "(11) 98765-4321",
    dataCadastro: "15/01/2024",
    status: "ativo"
},

{
    id: 2,
    nome: "Maria Santos",
    email: "maria@email.com",
    cpf: "987.654.321-00",
    telefone: "(11) 97654-3210",
    dataCadastro: "20/01/2024",
    status: "ativo"
},

{
    id: 3,
    nome: "Pedro Costa",
    email: "pedro@email.com",
    cpf: "456.789.123-00",
    telefone: "(11) 96543-2109",
    dataCadastro: "10/02/2024",
    status: "suspenso"
},

{
    id: 4,
    nome: "Ana Paula",
    email: "ana@email.com",
    cpf: "321.654.987-00",
    telefone: "(11) 95432-1098",
    dataCadastro: "05/03/2024",
    status: "ativo"
}

];

function renderizarUsuarios(lista) {

    const tbody =
        document.getElementById("listaUsuarios");

    tbody.innerHTML = "";

    lista.forEach(usuario => {

        tbody.innerHTML += `
        
        <tr>

            <td>
                <div class="avatar">
                    ${usuario.nome
                        .split(" ")
                        .map(n => n[0])
                        .join("")
                        .substring(0,2)}
                </div>
            </td>

            <td>${usuario.nome}</td>

            <td>${usuario.email}</td>

            <td>${usuario.cpf}</td>

            <td>${usuario.telefone}</td>

            <td>${usuario.dataCadastro}</td>

            <td>
                <span class="status ${usuario.status}">
                    ${usuario.status}
                </span>
            </td>

            <td>

                <button class="acao visualizar">
                    <i class="bi bi-eye"></i>
                </button>

                <button class="acao editar">
                    <i class="bi bi-pencil"></i>
                </button>

                <button class="acao suspender">
                    <i class="bi bi-slash-circle"></i>
                </button>

                <button class="acao excluir">
                    <i class="bi bi-trash"></i>
                </button>

            </td>

        </tr>

        `;
    });

    document.getElementById(
        "infoUsuarios"
    ).innerText =
        `Mostrando ${lista.length} usuários`;
}

renderizarUsuarios(usuariosMock);

const buscarUsuario =
document.getElementById("buscarUsuario");

buscarUsuario.addEventListener(
    "input",
    () => {

        const valor =
            buscarUsuario.value.toLowerCase();

        const filtrados =
            usuariosMock.filter(u =>

                u.nome.toLowerCase().includes(valor) ||
                u.email.toLowerCase().includes(valor) ||
                u.cpf.includes(valor)

            );

        renderizarUsuarios(filtrados);

    }
);
