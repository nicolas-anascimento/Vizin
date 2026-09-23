const escAdmin = valor => String(valor ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"})[c]);


const POR_PAGINA = 4;
const ICONES_CATEGORIA = {
    "Ferramentas": "bi-hammer",
    "Informática": "bi-laptop",
    "Eletrônicos": "bi-camera-reels",
    "Esportes": "bi-bicycle"
};
const CORES_THUMB = ["#6D49F2", "#F27C38", "#3B82C4", "#1F9D66", "#B4770A", "#C4362B"];

let estado = {
    busca: "",
    status: "todos",
    pagina: 1,
    anuncios: [],
    total: 0
};

const corpoTabela = document.getElementById("corpoTabelaAnuncios");
const infoPaginacao = document.getElementById("infoPaginacao");
const paginacaoEl = document.getElementById("paginacao");
const tabelaEstadoVazio = document.getElementById("tabelaEstadoVazio");
const inputBusca = document.getElementById("buscaAnuncios");

// =====================================================
// CARREGAR DADOS
// =====================================================
async function carregarAnuncios() {
    corpoTabela.innerHTML = `<tr><td colspan="8" class="admin-tabela-vazio">Carregando...</td></tr>`;
    tabelaEstadoVazio.hidden = true;

    try {
        const resposta = await listarAnunciosAdmin({
            busca: estado.busca,
            status: estado.status,
            pagina: estado.pagina,
            porPagina: POR_PAGINA
        });

        // Ciclo de vida: ativo/removido/arquivado (ver admin-anuncio-acoes.js).
        // "status" agora vem pronto do back como enum — não é mais derivado
        // do boolean "disponivel" (que só dava pra representar 2 estados).
        // Preserva o restante do objeto (`...a`) porque o modal "Ver anúncio"
        // depende de campos como descricao/localizacao/fotos_item que vêm
        // direto do back nessa mesma linha.
        estado.anuncios = (resposta.data || []).map(a => ({ ...a, proprietarioNome: a.usuarios?.nome || '—', categoria: a.categorias?.nome || '—', preco_dia: a.preco_por_dia, imagem: a.fotos_item?.[0]?.url, status: a.status }));
        estado.total = resposta.total;
    } catch (err) {
        corpoTabela.innerHTML = `<tr><td colspan="8" class="admin-tabela-vazio">${err.message}</td></tr>`;
        infoPaginacao.textContent = '';
        paginacaoEl.innerHTML = '';
        return;
    }

    const totalPaginasAtual = Math.max(1, Math.ceil(estado.total / POR_PAGINA));
    if (estado.pagina > totalPaginasAtual) {
        estado.pagina = totalPaginasAtual;
        return carregarAnuncios();
    }

    renderizarTabela();
    renderizarPaginacao();
}

// =====================================================
// RENDER
// =====================================================
function corThumb(id) {
    // id pode ser string (formato real da API) — soma dos char codes
    // dá um índice estável sem precisar que id seja numérico.
    let soma = 0;
    for (let i = 0; i < String(id).length; i++) soma += String(id).charCodeAt(i);
    return CORES_THUMB[soma % CORES_THUMB.length];
}

function indiceCategoria(categoria) {
    let soma = 0;
    for (let i = 0; i < categoria.length; i++) soma += categoria.charCodeAt(i);
    return soma % 5;
}

function formatarPreco(valor) {
    return `R$ ${Number(valor).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function labelStatus(status) {
    return { ativo: "Ativo", removido: "Removido", arquivado: "Arquivado" }[status] || status;
}

// Mesma prioridade que meus-objetos.js já usa do lado do usuário:
// locação ativa > solicitação pendente > pausado/disponível.
function infoDisponibilidade(anuncio) {
    if (anuncio.emLocacao) return { classe: "em-locacao", label: "Em locação" };
    if (anuncio.solicitacaoPendente) return { classe: "solicitacao-pendente", label: "Solicitação pendente" };
    if (anuncio.disponivel) return { classe: "disponivel", label: "Disponível" };
    return { classe: "pausado", label: "Pausado pelo dono" };
}

function renderizarThumb(anuncio) {
    if (anuncio.imagem) {
        return `<div class="admin-thumb" style="background-image:url('${anuncio.imagem}')"></div>`;
    }
    const icone = ICONES_CATEGORIA[anuncio.categoria] || "bi-box-seam";
    return `<div class="admin-thumb" style="background:${corThumb(anuncio.id)}"><i class="bi ${icone}"></i></div>`;
}

function renderizarTabela() {
    tabelaEstadoVazio.hidden = estado.anuncios.length > 0;

    corpoTabela.innerHTML = estado.anuncios.map(a => {
        const disp = infoDisponibilidade(a);
        return `
        <tr data-id="${a.id}">
            <td data-label="Imagem">${renderizarThumb(a)}</td>
            <td data-label="Título" class="admin-titulo-anuncio">${escAdmin(a.titulo)}</td>
            <td data-label="Proprietário">${escAdmin(a.proprietarioNome)}</td>
            <td data-label="Categoria"><span class="admin-cat-pill c${indiceCategoria(a.categoria)}">${escAdmin(a.categoria)}</span></td>
            <td data-label="Preço/Dia" class="admin-preco">${formatarPreco(a.preco_dia)}</td>
            <td data-label="Disponibilidade"><span class="admin-badge ${disp.classe}">${disp.label}</span></td>
            <td data-label="Status"><span class="admin-badge ${a.status}">${labelStatus(a.status)}</span></td>
            <td data-label="Ações">
                <div class="admin-acoes">
                    <button class="admin-acao-btn ver" title="Ver anúncio" data-acao="ver"><i class="bi bi-eye"></i></button>
                    <button class="admin-acao-btn status" title="Alterar status" data-acao="status"><i class="bi bi-shield-lock"></i></button>
                    <button class="admin-acao-btn excluir" title="Excluir" data-acao="excluir"><i class="bi bi-trash"></i></button>
                </div>
            </td>
        </tr>`;
    }).join("");
}

function renderizarPaginacao() {
    const totalPaginas = Math.max(1, Math.ceil(estado.total / POR_PAGINA));
    const inicio = estado.total === 0 ? 0 : (estado.pagina - 1) * POR_PAGINA + 1;
    const fim = Math.min(estado.pagina * POR_PAGINA, estado.total);

    infoPaginacao.textContent = `Mostrando ${inicio}–${fim} de ${estado.total} anúncios`;

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
        carregarAnuncios();
    }, 350);
});

// =====================================================
// FILTRO DE STATUS (Todos/Ativo/Removido)
// =====================================================
const btnFiltros = document.getElementById("btnFiltros");
const filtroStatusBar = document.getElementById("filtroStatusBar");
const pillsFiltro = document.querySelectorAll(".admin-filtro-pill");

btnFiltros.addEventListener("click", () => {
    filtroStatusBar.classList.toggle("aberta");
});

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

        filtroStatusBar.classList.remove("aberta");

        carregarAnuncios();
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

    carregarAnuncios();
});

// =====================================================
// AÇÕES DA LINHA (ver / status / excluir)
// =====================================================
corpoTabela.addEventListener("click", (e) => {
    const btn = e.target.closest(".admin-acao-btn");
    if (!btn) return;

    const linha = btn.closest("tr");
    const id = linha.dataset.id;
    const anuncio = estado.anuncios.find(a => String(a.id) === id);
    if (!anuncio) return;

    const acao = btn.dataset.acao;

    if (acao === "ver") {
        abrirModalVerAnuncio(anuncio);
    }

    if (acao === "status") {
        abrirModalStatusAnuncio(anuncio, () => carregarAnuncios());
    }

    if (acao === "excluir") {
        abrirModalExcluirAnuncio(anuncio, () => carregarAnuncios());
    }
});

// =====================================================
// INÍCIO
// =====================================================
carregarAnuncios();