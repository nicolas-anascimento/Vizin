const escAdmin = valor => String(valor ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"})[c]);


const POR_PAGINA = 4;
const CORES_AVATAR = ["#6D49F2", "#F27C38", "#3B82C4", "#1F9D66", "#B4770A", "#C4362B"];

let estado = {
    busca: "",
    status: "todos",
    pagina: 1,
    usuarios: [],
    total: 0
};

const corpoTabela = document.getElementById("corpoTabelaUsuarios");
const infoPaginacao = document.getElementById("infoPaginacao");
const paginacaoEl = document.getElementById("paginacao");
const tabelaEstadoVazio = document.getElementById("tabelaEstadoVazio");
const inputBusca = document.getElementById("buscaUsuarios");

// =====================================================
// CARREGAR DADOS
// =====================================================
async function carregarUsuarios() {
    corpoTabela.innerHTML = `<tr><td colspan="6" class="admin-tabela-vazio">Carregando...</td></tr>`;
    tabelaEstadoVazio.hidden = true;

    try {
        const resposta = await listarUsuariosAdmin({
            busca: estado.busca,
            status: estado.status,
            pagina: estado.pagina,
            porPagina: POR_PAGINA
        });
        estado.total = resposta.total;
        estado.usuarios = resposta.dados
            .map(u => ({ ...u, status: u.ativo ? 'ativo' : 'inativo', dataCadastro: u.criado_em }));
    } catch (err) {
        corpoTabela.innerHTML = `<tr><td colspan="6" class="admin-tabela-vazio">${escAdmin(err.message)}</td></tr>`;
        infoPaginacao.textContent = '';
        paginacaoEl.innerHTML = '';
        return;
    }

    // Se a página atual ficou fora do intervalo (ex: excluiu o último
    // usuário da última página), volta pra última página válida e
    // busca de novo, em vez de mostrar uma tabela vazia sem explicação.
    const totalPaginasAtual = Math.max(1, Math.ceil(estado.total / POR_PAGINA));
    if (estado.pagina > totalPaginasAtual) {
        estado.pagina = totalPaginasAtual;
        return carregarUsuarios();
    }

    renderizarTabela();
    renderizarPaginacao();
}

// =====================================================
// RENDER
// =====================================================
function iniciais(nome) {
    return nome.split(" ").filter(Boolean).slice(0, 2).map(p => p[0].toUpperCase()).join("") || "?";
}

function corAvatar(id) {
    return CORES_AVATAR[[...String(id)].reduce((n, c) => n + c.charCodeAt(0), 0) % CORES_AVATAR.length];
}

function formatarData(iso) {
    if (!iso) return "—";
    const [ano, mes, dia] = iso.slice(0, 10).split("-");
    return `${dia}/${mes}/${ano}`;
}

function labelStatus(status) {
    return { ativo: "Ativo", inativo: "Inativo" }[status] || status;
}

function renderizarTabela() {
    tabelaEstadoVazio.hidden = estado.usuarios.length > 0;

    // data-label em cada <td>: usado pelo CSS no breakpoint mobile pra
    // mostrar o nome da coluna ao lado do valor quando a tabela vira
    // uma lista de cards (ver usuarios.css).
    corpoTabela.innerHTML = estado.usuarios.map(u => `
        <tr data-id="${escAdmin(u.id)}">
            <td data-label="Foto"><div class="admin-avatar" style="background:${corAvatar(u.id)}">${iniciais(u.nome)}</div></td>
            <td data-label="Nome" class="admin-nome">${escAdmin(u.nome)}</td>
            <td data-label="Email" class="admin-email">${escAdmin(u.email)}</td>
            <td data-label="Data Cadastro">${formatarData(u.dataCadastro)}</td>
            <td data-label="Status"><span class="admin-badge ${u.status}">${labelStatus(u.status)}</span></td>
            <td data-label="Ações">
                <div class="admin-acoes">
                    <button class="admin-acao-btn ver" title="Ver detalhes" data-acao="ver"><i class="bi bi-eye"></i></button>

                    <button class="admin-acao-btn status" title="Alterar status" data-acao="status"><i class="bi bi-shield-lock"></i></button>
                    <button class="admin-acao-btn excluir" title="Excluir" data-acao="excluir"><i class="bi bi-trash"></i></button>
                </div>
            </td>
        </tr>
    `).join("");
}

function renderizarPaginacao() {
    const totalPaginas = Math.max(1, Math.ceil(estado.total / POR_PAGINA));
    const inicio = estado.total === 0 ? 0 : (estado.pagina - 1) * POR_PAGINA + 1;
    const fim = Math.min(estado.pagina * POR_PAGINA, estado.total);

    infoPaginacao.textContent = `Mostrando ${inicio}–${fim} de ${estado.total} usuários`;

    let botoes = `<button class="admin-pagina-btn" data-pagina="anterior" ${estado.pagina === 1 ? "disabled" : ""}>Anterior</button>`;

    for (let p = 1; p <= totalPaginas; p++) {
        botoes += `<button class="admin-pagina-btn ${p === estado.pagina ? "active" : ""}" data-pagina="${p}">${p}</button>`;
    }

    botoes += `<button class="admin-pagina-btn" data-pagina="proximo" ${estado.pagina === totalPaginas ? "disabled" : ""}>Próximo</button>`;

    paginacaoEl.innerHTML = botoes;
}

// =====================================================
// BUSCA (com debounce)
// =====================================================
let debounceId = null;
inputBusca.addEventListener("input", () => {
    clearTimeout(debounceId);
    debounceId = setTimeout(() => {
        estado.busca = inputBusca.value.trim();
        estado.pagina = 1;
        carregarUsuarios();
    }, 350);
});

// =====================================================
// FILTRO DE STATUS (barra de pills escondida por padrão; o botão
// "Filtros" abre/fecha ela, em qualquer tamanho de tela)
// =====================================================
const btnFiltros = document.getElementById("btnFiltros");
const filtroStatusBar = document.getElementById("filtroStatusBar");
const pillsFiltro = document.querySelectorAll(".admin-filtro-pill");

btnFiltros.addEventListener("click", () => {
    filtroStatusBar.classList.toggle("aberta");
});

// Fecha a barra ao clicar fora dela/do botão.
document.addEventListener("click", (e) => {
    if (!e.target.closest(".admin-filtros-container")) {
        filtroStatusBar.classList.remove("aberta");
    }
});

pillsFiltro.forEach(pill => {
    pill.addEventListener("click", () => {
        pillsFiltro.forEach(p => p.classList.remove("active"));
        pill.classList.add("active");

        estado.status = pill.dataset.status;
        estado.pagina = 1;
        btnFiltros.classList.toggle("active", estado.status !== "todos");

        // Fecha o painel depois de escolher o status.
        filtroStatusBar.classList.remove("aberta");

        carregarUsuarios();
    });
});

// =====================================================
// PAGINAÇÃO
// =====================================================
paginacaoEl.addEventListener("click", (e) => {
    const btn = e.target.closest(".admin-pagina-btn");
    if (!btn || btn.disabled) return;

    const alvo = btn.dataset.pagina;
    const totalPaginas = Math.max(1, Math.ceil(estado.total / POR_PAGINA));

    if (alvo === "anterior") estado.pagina = Math.max(1, estado.pagina - 1);
    else if (alvo === "proximo") estado.pagina = Math.min(totalPaginas, estado.pagina + 1);
    else estado.pagina = Number(alvo);

    carregarUsuarios();
});

// =====================================================
// AÇÕES DA LINHA (ver / editar / status / excluir)
// =====================================================
corpoTabela.addEventListener("click", (e) => {
    const btn = e.target.closest(".admin-acao-btn");
    if (!btn) return;

    const linha = btn.closest("tr");
    const id = linha.dataset.id;
    const usuario = estado.usuarios.find(u => u.id === id);
    if (!usuario) return;

    const acao = btn.dataset.acao;

    if (acao === "ver") {
        window.location.href = `/admin/usuarios/detalhe?id=${usuario.id}`;
    }



    if (acao === "status") {
        abrirModalStatus(usuario, () => carregarUsuarios());
    }

    if (acao === "excluir") {
        abrirModalExcluir(usuario, () => carregarUsuarios());
    }
});

// =====================================================
// INÍCIO
// =====================================================
carregarUsuarios();
