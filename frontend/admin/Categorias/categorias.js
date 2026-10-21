const escAdmin = valor => String(valor ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"})[c]);

// =====================================================
// ESTADO
// =====================================================
let estado = {
    categorias: []
};

const grade = document.getElementById("gradeCategorias");

// =====================================================
// CARREGAR + RENDER
// =====================================================
// iconeCategoriaValido/corCategoriaValida/fundoClaroCategoria vêm de
// categorias-acoes.js (carregado antes deste arquivo — ver ordem dos
// <script> no index.html).
function contagemItens(c) {
    const bruto = c.total_itens ?? c.total ?? c.qtd_itens;
    if (bruto === null || bruto === undefined || bruto === "") return null;
    const n = Number(bruto);
    return Number.isFinite(n) ? n : null;
}

function normalizar(c) {
    return {
        id: c.id,
        nome: c.nome || "—",
        icone: iconeCategoriaValido(c.icone),
        cor: corCategoriaValida(c.cor),
        // null = o back não mandou a contagem (diferente de 0 itens de verdade).
        total: contagemItens(c)
    };
}

async function carregarCategorias() {
    grade.innerHTML = `<p class="cat-estado">Carregando...</p>`;
    try {
        const lista = await listarCategoriasAdmin();
        // Mais itens primeiro (mesma ordem do design)
        estado.categorias = lista.map(normalizar).sort((a, b) => (b.total ?? 0) - (a.total ?? 0) || a.nome.localeCompare(b.nome, "pt-BR"));
    } catch (erro) {
        grade.innerHTML = `<p class="cat-estado">${escAdmin(erro.message)}</p>`;
        return;
    }
    renderizarEstatisticas();
    renderizarGrade();
}

function renderizarEstatisticas() {
    const qtd = estado.categorias.length;
    const totalItens = estado.categorias.reduce((soma, c) => soma + (c.total ?? 0), 0);
    document.getElementById("statTotalCategorias").textContent = qtd;

    // Se alguma categoria veio sem contagem, o total e a média seriam falsos
    // (mostrariam 0 como se não houvesse itens). Melhor mostrar "–" e avisar no console.
    if (estado.categorias.some(c => c.total === null)) {
        console.warn("[categorias] a API não devolveu total_itens para alguma categoria; total e média não foram calculados.");
        document.getElementById("statTotalItens").textContent = "–";
        document.getElementById("statMedia").textContent = "–";
        return;
    }

    document.getElementById("statTotalItens").textContent = totalItens.toLocaleString("pt-BR");
    // Uma casa decimal: com poucos itens a média costuma ser fracionária (4 itens / 10
    // categorias = 0,4) e arredondar para inteiro mostrava 0.
    document.getElementById("statMedia").textContent = qtd
        ? (totalItens / qtd).toLocaleString("pt-BR", { minimumFractionDigits: 0, maximumFractionDigits: 1 })
        : "0";
}

function renderizarGrade() {
    // Sem nenhuma categoria cadastrada, ninguém consegue anunciar objetos
    // na plataforma (o <select> de Cadastrar/Editar Objeto fica vazio) —
    // por isso um aviso próprio aqui, em vez de só mostrar o card de add.
    if (!estado.categorias.length) {
        grade.innerHTML = `
            <div class="cat-estado-vazio">
                <i class="bi bi-tags"></i>
                <p>Nenhuma categoria cadastrada ainda. Sem categorias, ninguém consegue anunciar objetos na plataforma.</p>
            </div>
            <button type="button" class="cat-card cat-card-add" data-acao="criar">
                <span class="cat-add-quadrado"><i class="bi bi-plus-lg"></i></span>
                <strong>Adicionar Categoria</strong>
                <small>Criar a primeira categoria</small>
            </button>`;
        return;
    }

    const totalItens = estado.categorias.reduce((soma, c) => soma + (c.total ?? 0), 0);

    const cards = estado.categorias.map(c => {
        const semContagem = c.total === null;
        const pct = totalItens && !semContagem ? (c.total / totalItens) * 100 : 0;
        return `
        <article class="cat-card" data-id="${escAdmin(c.id)}">
            <div class="cat-card-topo">
                <div class="cat-icone-box" style="background:${fundoClaroCategoria(c.cor)}; color:${c.cor}">
                    <i class="bi ${c.icone}"></i>
                </div>
                <div class="cat-card-acoes">
                    <button type="button" class="cat-acao-btn editar" data-acao="editar" title="Editar categoria" aria-label="Editar ${escAdmin(c.nome)}"><i class="bi bi-pencil-square"></i></button>
                    <button type="button" class="cat-acao-btn excluir" data-acao="excluir" title="Excluir categoria" aria-label="Excluir ${escAdmin(c.nome)}"><i class="bi bi-trash3"></i></button>
                </div>
            </div>
            <h3 class="cat-card-nome">${escAdmin(c.nome)}</h3>
            <div class="cat-card-linha">
                <span>Itens vinculados</span>
                <strong style="color:${c.cor}">${semContagem ? "—" : c.total.toLocaleString("pt-BR")}</strong>
            </div>
            <div class="cat-barra"><div style="width:${pct.toFixed(1)}%; background:${c.cor}"></div></div>
            <small class="cat-percentual">${semContagem ? "Contagem indisponível" : `${pct.toFixed(1)}% do total`}</small>
        </article>`;
    }).join("");

    const adicionar = `
        <button type="button" class="cat-card cat-card-add" data-acao="criar">
            <span class="cat-add-quadrado"><i class="bi bi-plus-lg"></i></span>
            <strong>Adicionar Categoria</strong>
            <small>Criar nova categoria de itens</small>
        </button>`;

    grade.innerHTML = cards + adicionar;
}

// =====================================================
// CLIQUES (delegam pra categorias-acoes.js)
// =====================================================
grade.addEventListener("click", (e) => {
    const btn = e.target.closest("[data-acao]");
    if (!btn) return;

    if (btn.dataset.acao === "criar") {
        return abrirModalCategoria(null, estado.categorias, carregarCategorias);
    }

    const id = btn.closest(".cat-card")?.dataset.id;
    const categoria = estado.categorias.find(c => String(c.id) === id);
    if (!categoria) return;

    if (btn.dataset.acao === "editar") abrirModalCategoria(categoria, estado.categorias, carregarCategorias);
    if (btn.dataset.acao === "excluir") abrirModalExcluirCategoria(categoria, estado.categorias, carregarCategorias);
});

document.getElementById("btnCriarCategoria").addEventListener("click", () => {
    abrirModalCategoria(null, estado.categorias, carregarCategorias);
});

// =====================================================
// INÍCIO
// =====================================================
carregarCategorias();