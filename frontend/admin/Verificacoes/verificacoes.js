const escAdmin = valor => String(valor ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"})[c]);

const POR_PAGINA = 25;
const CORES_AVATAR = ["#6D49F2", "#F27C38", "#3B82C4", "#1F9D66", "#B4770A", "#C4362B"];

// Status do back -> classe do badge (admin-shared.css) + texto.
// Âmbar = aguardando decisão; verde = aprovada; vermelho = reprovada.
const STATUS_UI = {
    pendente: { classe: "suspenso", label: "Em análise" },
    aprovado: { classe: "ativo",    label: "Aprovada" },
    rejeitado:{ classe: "inativo",  label: "Reprovada" },
    cancelado:{ classe: "suspenso", label: "Cancelada" } // o usuário desistiu do envio
};
// Uma verificação revogada volta como "rejeitado" + revogada:true; no admin
// ela aparece como "Revogada" pra não se confundir com uma reprovação normal.
function uiStatus(v) {
    if (v.status === "rejeitado" && v.revogada) return { classe: "inativo", label: "Revogada" };
    return STATUS_UI[v.status] || { classe: "suspenso", label: v.status };
}
const STATUS_VALIDOS = ["pendente", "aprovado", "rejeitado", "todos"];

let estado = { busca: "", status: "pendente", pagina: 1, itens: [], total: 0 };

// Permite abrir já filtrada (ex: /admin/verificacoes?status=aprovado).
const _statusUrl = new URLSearchParams(window.location.search).get("status");
if (STATUS_VALIDOS.includes(_statusUrl)) estado.status = _statusUrl;

const corpoTabela = document.getElementById("corpoTabelaVerificacoes");
const infoPaginacao = document.getElementById("infoPaginacao");
const paginacaoEl = document.getElementById("paginacao");
const tabelaEstadoVazio = document.getElementById("tabelaEstadoVazio");
const inputBusca = document.getElementById("buscaVerificacoes");
const pillsFiltro = document.querySelectorAll(".admin-filtro-pill");

// Aceita tanto { nome, email } quanto { usuario: { nome, email } } vindo do back.
function normalizar(v) {
    const u = v.usuario || {};
    return {
        id: v.id,
        usuarioId: v.usuario_id ?? u.id ?? v.id,
        nome: v.nome ?? u.nome ?? "",
        email: v.email ?? u.email ?? "",
        // sem isto a foto do usuário se perdia aqui e a lista só mostrava as iniciais
        avatarUrl: v.avatarUrl ?? v.avatar_url ?? u.avatarUrl ?? u.avatar_url ?? null,
        status: v.status,
        enviadoEm: v.criado_em,
        revogada: !!v.revogada,
        // false só quando o back diz explicitamente que a conta está suspensa
        usuarioAtiva: (v.usuario_ativo ?? u.ativo) !== false
    };
}

async function carregar() {
    corpoTabela.innerHTML = `<tr><td colspan="6" class="admin-tabela-vazio">Carregando...</td></tr>`;
    tabelaEstadoVazio.hidden = true;

    try {
        const resposta = await listarVerificacoesAdmin({
            busca: estado.busca, status: estado.status, pagina: estado.pagina, porPagina: POR_PAGINA
        });
        estado.total = Number(resposta.total) || 0;
        // Aceita { dados } | { data } | array puro (as outras rotas admin usam `data`).
        const lista = Array.isArray(resposta) ? resposta : (resposta.dados ?? resposta.data ?? []);
        estado.itens = lista.map(normalizar);
    } catch (err) {
        corpoTabela.innerHTML = `<tr><td colspan="6" class="admin-tabela-vazio">${escAdmin(err.message)}</td></tr>`;
        infoPaginacao.textContent = "";
        paginacaoEl.innerHTML = "";
        return;
    }

    // Página fora do intervalo (ex: decidiu o último item da última página).
    const totalPaginas = Math.max(1, Math.ceil(estado.total / POR_PAGINA));
    if (estado.pagina > totalPaginas) {
        estado.pagina = totalPaginas;
        return carregar();
    }

    renderizarTabela();
    renderizarPaginacao();
}

function iniciais(nome) {
    return String(nome ?? "").split(" ").filter(Boolean).slice(0, 2).map(p => p[0].toUpperCase()).join("") || "?";
}

function corAvatar(id) {
    return CORES_AVATAR[[...String(id)].reduce((n, c) => n + c.charCodeAt(0), 0) % CORES_AVATAR.length];
}

function formatarDataHora(iso) {
    if (!iso) return "—";
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return "—";
    return `${d.toLocaleDateString("pt-BR")} ${d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}`;
}

// "há 5 min", "há 3 h", "há 2 dias" — e o quanto passou do prazo de 48 h
// prometido ao usuário (só importa enquanto está pendente).
const PRAZO_HORAS = 48;

function tempoDecorrido(iso) {
    const d = new Date(iso);
    if (!iso || Number.isNaN(d.getTime())) return { texto: "", horas: 0 };
    const minutos = Math.max(0, Math.floor((Date.now() - d.getTime()) / 60000));
    if (minutos < 60) return { texto: `há ${minutos} min`, horas: minutos / 60 };
    const horas = Math.floor(minutos / 60);
    if (horas < 48) return { texto: `há ${horas} h`, horas };
    return { texto: `há ${Math.floor(horas / 24)} dias`, horas };
}

function renderizarTabela() {
    tabelaEstadoVazio.hidden = estado.itens.length > 0;
    tabelaEstadoVazio.textContent = estado.status === "pendente" && !estado.busca
        ? "Nenhum documento aguardando análise."
        : "Nenhuma verificação encontrada.";

    corpoTabela.innerHTML = estado.itens.map(v => {
        const ui = uiStatus(v);
        const tempo = tempoDecorrido(v.enviadoEm);
        const atrasada = v.status === "pendente" && tempo.horas > PRAZO_HORAS;
        return `
        <tr data-id="${escAdmin(v.id)}">
            <td data-label="Foto"><div class="admin-avatar" style="background:${corAvatar(v.usuarioId)}">${window.avatarAdminHtml ? window.avatarAdminHtml(v.avatarUrl ?? v.avatar_url, iniciais(v.nome)) : escAdmin(iniciais(v.nome))}</div></td>
            <td data-label="Nome" class="admin-nome">${escAdmin(v.nome)}${v.usuarioAtiva ? "" : ' <span class="verif-tag-suspensa" title="Conta suspensa">Suspensa</span>'}</td>
            <td data-label="Email" class="admin-email">${escAdmin(v.email)}</td>
            <td data-label="Enviado em"><span class="verif-enviado">${formatarDataHora(v.enviadoEm)}${tempo.texto ? `<small class="${atrasada ? "atrasada" : ""}">${tempo.texto}${atrasada ? " · passou de 48 h" : ""}</small>` : ""}</span></td>
            <td data-label="Status"><span class="admin-badge ${ui.classe}">${ui.label}</span></td>
            <td data-label="Ações">
                <div class="admin-acoes">
                    <button class="admin-acao-btn ver" title="${v.status === "pendente" ? "Analisar" : "Ver análise"}" data-acao="analisar"><i class="bi bi-eye"></i></button>
                </div>
            </td>
        </tr>`;
    }).join("");
}

function renderizarPaginacao() {
    const totalPaginas = Math.max(1, Math.ceil(estado.total / POR_PAGINA));
    const inicio = estado.total === 0 ? 0 : (estado.pagina - 1) * POR_PAGINA + 1;
    const fim = Math.min(estado.pagina * POR_PAGINA, estado.total);

    infoPaginacao.textContent = `Mostrando ${inicio}–${fim} de ${estado.total} verificações`;

    let botoes = `<button class="admin-pagina-btn" data-pagina="anterior" ${estado.pagina === 1 ? "disabled" : ""}>Anterior</button>`;
    for (let p = 1; p <= totalPaginas; p++) {
        botoes += `<button class="admin-pagina-btn ${p === estado.pagina ? "active" : ""}" data-pagina="${p}">${p}</button>`;
    }
    botoes += `<button class="admin-pagina-btn" data-pagina="proximo" ${estado.pagina === totalPaginas ? "disabled" : ""}>Próximo</button>`;
    paginacaoEl.innerHTML = botoes;
}

// ================= BUSCA (debounce) =================
let debounceId = null;
inputBusca.addEventListener("input", () => {
    clearTimeout(debounceId);
    debounceId = setTimeout(() => {
        estado.busca = inputBusca.value.trim();
        estado.pagina = 1;
        carregar();
    }, 350);
});

// ================= FILTRO DE STATUS =================
pillsFiltro.forEach(p => p.classList.toggle("active", p.dataset.status === estado.status));

pillsFiltro.forEach(pill => {
    pill.addEventListener("click", () => {
        pillsFiltro.forEach(p => p.classList.remove("active"));
        pill.classList.add("active");
        estado.status = pill.dataset.status;
        estado.pagina = 1;
        carregar();
    });
});

// ================= PAGINAÇÃO =================
paginacaoEl.addEventListener("click", (e) => {
    const btn = e.target.closest(".admin-pagina-btn");
    if (!btn || btn.disabled) return;

    const alvo = btn.dataset.pagina;
    const totalPaginas = Math.max(1, Math.ceil(estado.total / POR_PAGINA));

    if (alvo === "anterior") estado.pagina = Math.max(1, estado.pagina - 1);
    else if (alvo === "proximo") estado.pagina = Math.min(totalPaginas, estado.pagina + 1);
    else estado.pagina = Number(alvo);

    carregar();
});

// ================= ABRIR ANÁLISE =================
function abrirAnalise(id) {
    window.location.href = `/admin/verificacoes/analise?id=${encodeURIComponent(id)}`;
}

corpoTabela.addEventListener("click", (e) => {
    const linha = e.target.closest("tr[data-id]");
    if (linha) abrirAnalise(linha.dataset.id);
});

carregar();