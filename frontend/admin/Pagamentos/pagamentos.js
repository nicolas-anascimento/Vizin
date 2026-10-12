const escAdmin = valor => String(valor ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"})[c]);

const POR_PAGINA = 10;

let estado = {
    busca: "",
    status: "todos",
    pagina: 1,
    transacoes: [],
    total: 0
};

const corpoTabela = document.getElementById("corpoTabelaTransacoes");
const infoPaginacao = document.getElementById("infoPaginacao");
const paginacaoEl = document.getElementById("paginacao");
const tabelaEstadoVazio = document.getElementById("tabelaEstadoVazio");
const inputBusca = document.getElementById("buscaTransacoes");

// =====================================================
// UTILITÁRIOS (usados também pelo modal de detalhes)
// =====================================================
function formatarPrecoPagamento(valor) {
    return `R$ ${Number(valor || 0).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function labelStatusPagamento(status) {
    return { pago: "Concluído", pendente: "Pendente", falhou: "Falhou", estornado: "Estornado" }[status] || status;
}

function labelMetodoPagamento(metodo) {
    return { pix: "PIX", cartao: "Cartão" }[metodo] || metodo;
}

// =====================================================
// CARDS + GRÁFICOS (topo da página)
// =====================================================
async function carregarEstatisticas() {
    let est;
    try {
        est = await obterEstatisticasPagamentosAdmin();
    } catch (err) {
        // "—" também é o estado inicial (carregando), então em erro real
        // usamos um texto diferente + título com a mensagem, pra não parecer
        // que a página só está demorando.
        ["statReceitaTotal", "statPendentes", "statFalhadas"].forEach(id => {
            const el = document.getElementById(id);
            el.textContent = "Erro";
            el.title = err.message;
            el.classList.add("erro");
        });
        document.getElementById("graficoReceitaMensal").innerHTML = `<p class="admin-grafico-erro">${escAdmin(err.message)}</p>`;
        document.getElementById("graficoMetodos").innerHTML = "";
        return;
    }

    ["statReceitaTotal", "statPendentes", "statFalhadas"].forEach(id => {
        const el = document.getElementById(id);
        el.classList.remove("erro");
        el.removeAttribute("title");
    });

    document.getElementById("statReceitaTotal").textContent = formatarPrecoPagamento(est.receita_total);
    document.getElementById("statPendentes").textContent = est.pagamentos_pendentes ?? 0;
    document.getElementById("statFalhadas").textContent = est.transacoes_falhadas ?? 0;

    const variacaoEl = document.getElementById("statReceitaVariacao");
    const variacao = Number(est.receita_variacao_percentual);
    if (Number.isFinite(variacao)) {
        variacaoEl.textContent = `${variacao >= 0 ? "+" : ""}${variacao.toFixed(0)}% vs mês anterior`;
        variacaoEl.className = `admin-stat-variacao ${variacao >= 0 ? "positiva" : "negativa"}`;
    } else {
        variacaoEl.textContent = "";
    }

    renderizarGraficoReceita(est.receita_mensal || []);
    renderizarGraficoMetodos(est.metodos || []);
}

// Gráfico de linha simples, sem lib externa — só os 6 últimos pontos que
// o back mandar em receita_mensal.
function renderizarGraficoReceita(pontos) {
    const container = document.getElementById("graficoReceitaMensal");
    if (!pontos.length) {
        container.innerHTML = `<p class="admin-grafico-vazio">Sem dados de receita ainda.</p>`;
        return;
    }

    const largura = 560, altura = 200, margem = 28;
    const valores = pontos.map(p => Number(p.valor) || 0);
    const maxValor = Math.max(...valores, 1);

    const passoX = (largura - margem * 2) / Math.max(1, pontos.length - 1);
    const coords = valores.map((v, i) => {
        const x = margem + i * passoX;
        const y = altura - margem - (v / maxValor) * (altura - margem * 2);
        return { x, y };
    });

    const linha = coords.map((c, i) => `${i === 0 ? "M" : "L"}${c.x.toFixed(1)},${c.y.toFixed(1)}`).join(" ");
    const area = `${linha} L${coords[coords.length - 1].x.toFixed(1)},${altura - margem} L${coords[0].x.toFixed(1)},${altura - margem} Z`;

    const pontosSvg = coords.map(c => `<circle cx="${c.x.toFixed(1)}" cy="${c.y.toFixed(1)}" r="3.5" fill="#F27C38"></circle>`).join("");
    const rotulos = pontos.map((p, i) => `<text x="${coords[i].x.toFixed(1)}" y="${altura - 6}" text-anchor="middle" class="admin-grafico-rotulo">${escAdmin(p.mes)}</text>`).join("");

    container.innerHTML = `
        <svg viewBox="0 0 ${largura} ${altura}" class="admin-grafico-svg">
            <path d="${area}" fill="rgba(242,124,56,0.12)" stroke="none"></path>
            <path d="${linha}" fill="none" stroke="#F27C38" stroke-width="2.5"></path>
            ${pontosSvg}
            ${rotulos}
        </svg>`;
}

// Gráfico de barras simples — um por método (só os que vierem do back).
function renderizarGraficoMetodos(metodos) {
    const container = document.getElementById("graficoMetodos");
    if (!metodos.length) {
        container.innerHTML = `<p class="admin-grafico-vazio">Sem dados de métodos ainda.</p>`;
        return;
    }

    const largura = 560, altura = 200, margem = 28;
    const totais = metodos.map(m => Number(m.total) || 0);
    const maxTotal = Math.max(...totais, 1);
    const larguraUtil = largura - margem * 2;
    const larguraBarra = Math.min(70, larguraUtil / metodos.length - 20);

    const barras = metodos.map((m, i) => {
        const alturaBarra = (Number(m.total) || 0) / maxTotal * (altura - margem * 2);
        const x = margem + i * (larguraUtil / metodos.length) + ((larguraUtil / metodos.length) - larguraBarra) / 2;
        const y = altura - margem - alturaBarra;
        return `
            <rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${larguraBarra.toFixed(1)}" height="${alturaBarra.toFixed(1)}" rx="6" fill="#6D49F2"></rect>
            <text x="${(x + larguraBarra / 2).toFixed(1)}" y="${altura - 6}" text-anchor="middle" class="admin-grafico-rotulo">${escAdmin(labelMetodoPagamento(m.metodo))}</text>`;
    }).join("");

    container.innerHTML = `<svg viewBox="0 0 ${largura} ${altura}" class="admin-grafico-svg">${barras}</svg>`;
}

// =====================================================
// TABELA DE TRANSAÇÕES
// =====================================================
// Token da requisição em andamento: cada chamada gera um número novo, e só
// a resposta cujo token ainda bate com o "mais recente pedido" é aplicada
// na tela. Evita que uma resposta antiga (rede lenta, cliques rápidos em
// paginação/busca) sobrescreva a tabela com dados de uma página/filtro que
// o admin já deixou de estar vendo.
let tokenRequisicaoTransacoes = 0;

async function carregarTransacoes() {
    const meuToken = ++tokenRequisicaoTransacoes;

    corpoTabela.innerHTML = `<tr><td colspan="7" class="admin-tabela-vazio">Carregando...</td></tr>`;
    tabelaEstadoVazio.hidden = true;

    let resposta;
    try {
        resposta = await listarTransacoesAdmin({
            busca: estado.busca,
            status: estado.status,
            pagina: estado.pagina,
            porPagina: POR_PAGINA
        });
    } catch (err) {
        if (meuToken !== tokenRequisicaoTransacoes) return; // resposta obsoleta, ignora
        corpoTabela.innerHTML = `<tr><td colspan="7" class="admin-tabela-vazio">${escAdmin(err.message)}</td></tr>`;
        infoPaginacao.textContent = '';
        paginacaoEl.innerHTML = '';
        return;
    }

    if (meuToken !== tokenRequisicaoTransacoes) return; // já saiu uma requisição mais nova, ignora esta

    estado.transacoes = resposta.data || [];
    estado.total = resposta.total || 0;

    const totalPaginasAtual = Math.max(1, Math.ceil(estado.total / POR_PAGINA));
    if (estado.pagina > totalPaginasAtual) {
        estado.pagina = totalPaginasAtual;
        return carregarTransacoes();
    }

    renderizarTabela();
    renderizarPaginacao();
}

function idCurto(id) {
    // Mostra só os 8 primeiros caracteres do UUID na tabela (cabe melhor na
    // coluna); o modal de detalhes mostra o id inteiro.
    return `#${String(id).slice(0, 8)}`;
}

// Nome + e-mail (ou link pro perfil) — só o nome não é suficiente numa
// tela financeira, onde dois usuários com o mesmo nome não podem ficar
// ambíguos. Reaproveitado pela tabela e pelo modal de detalhes.
function celulaUsuarioPagamento(usuario) {
    if (!usuario) return "—";

    const nome = escAdmin(usuario.nome || "—");
    const nomeHtml = usuario.id
        ? `<a href="/admin/usuarios/detalhe?id=${encodeURIComponent(usuario.id)}" class="admin-usuario-link">${nome}</a>`
        : nome;

    return usuario.email
        ? `${nomeHtml}<br><span class="admin-usuario-email">${escAdmin(usuario.email)}</span>`
        : nomeHtml;
}

function renderizarTabela() {
    tabelaEstadoVazio.hidden = estado.transacoes.length > 0;

    corpoTabela.innerHTML = estado.transacoes.map(t => `
        <tr data-id="${t.id}">
            <td data-label="ID" class="admin-transacao-id">${escAdmin(idCurto(t.id))}</td>
            <td data-label="Usuário">${celulaUsuarioPagamento(t.usuario)}</td>
            <td data-label="Método"><span class="admin-metodo-pill">${escAdmin(labelMetodoPagamento(t.metodo))}</span></td>
            <td data-label="Valor" class="admin-preco">${formatarPrecoPagamento(t.valor)}</td>
            <td data-label="Data">${t.criado_em ? new Date(t.criado_em).toLocaleDateString("pt-BR") : "—"}</td>
            <td data-label="Status"><span class="admin-badge ${t.status}">${escAdmin(labelStatusPagamento(t.status))}</span></td>
            <td data-label="Ações">
                <div class="admin-acoes">
                    <button class="admin-acao-btn ver" title="Ver detalhes" data-acao="ver"><i class="bi bi-eye"></i></button>
                </div>
            </td>
        </tr>`).join("");
}

function renderizarPaginacao() {
    const totalPaginas = Math.max(1, Math.ceil(estado.total / POR_PAGINA));
    const inicio = estado.total === 0 ? 0 : (estado.pagina - 1) * POR_PAGINA + 1;
    const fim = Math.min(estado.pagina * POR_PAGINA, estado.total);

    infoPaginacao.textContent = `Mostrando ${inicio}–${fim} de ${estado.total} transações`;

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
        carregarTransacoes();
    }, 350);
});

// =====================================================
// FILTRO DE STATUS
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

function aplicarFiltroStatus(status) {
    estado.status = status;
    estado.pagina = 1;
    btnFiltros.classList.toggle("active", estado.status !== "todos");
    filtroStatusBar.classList.remove("aberta");

    pillsFiltro.forEach(p => p.classList.toggle("active", p.dataset.status === status));

    carregarTransacoes();
}

pillsFiltro.forEach(pill => {
    pill.addEventListener("click", () => aplicarFiltroStatus(pill.dataset.status));
});

// =====================================================
// CARDS DO TOPO COMO ATALHO DE FILTRO
// =====================================================
// "Pendentes" e "Falhadas" já mostram uma contagem — deixá-los clicáveis
// aplica o filtro correspondente direto na tabela, sem precisar abrir o
// dropdown de Filtros e achar o pill certo.
const cardPendentes = document.getElementById("statPendentes").closest(".admin-stat-card");
const cardFalhadas = document.getElementById("statFalhadas").closest(".admin-stat-card");

function tornarCardClicavel(card, status) {
    if (!card) return;
    card.classList.add("admin-stat-card-clicavel");
    card.setAttribute("role", "button");
    card.setAttribute("tabindex", "0");
    const ativar = () => {
        aplicarFiltroStatus(status);
        card.closest("main")?.querySelector(".admin-card")?.scrollIntoView({ behavior: "smooth", block: "start" });
    };
    card.addEventListener("click", ativar);
    card.addEventListener("keydown", (e) => {
        if (e.key === "Enter" || e.key === " ") { e.preventDefault(); ativar(); }
    });
}

tornarCardClicavel(cardPendentes, "pendente");
tornarCardClicavel(cardFalhadas, "falhou");

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

    carregarTransacoes();
});

// =====================================================
// AÇÕES DA LINHA (só "ver detalhes")
// =====================================================
corpoTabela.addEventListener("click", (e) => {
    const btn = e.target.closest(".admin-acao-btn");
    if (!btn) return;

    const linha = btn.closest("tr");
    const id = linha.dataset.id;
    const transacao = estado.transacoes.find(t => String(t.id) === id);
    if (!transacao) return;

    if (btn.dataset.acao === "ver") {
        abrirModalDetalhesTransacao(transacao);
    }
});

// =====================================================
// INÍCIO
// =====================================================
carregarEstatisticas();
carregarTransacoes();

// =====================================================
// ABRIR DIRETO UMA TRANSAÇÃO (?abrir=<id>) — usado pela central de
// notificações. O modal já busca o detalhe e mostra o erro dele
// (ex.: transação inexistente) dentro dele mesmo.
// =====================================================
(function abrirItemDaUrl() {
    const params = new URLSearchParams(window.location.search);
    const id = params.get("abrir");
    if (!id) return;
    params.delete("abrir");
    const resto = params.toString();
    history.replaceState(null, "", window.location.pathname + (resto ? `?${resto}` : ""));
    abrirModalDetalhesTransacao({ id });
})();
