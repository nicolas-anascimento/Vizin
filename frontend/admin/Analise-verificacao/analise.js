const escAdmin = valor => String(valor ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"})[c]);

const CORES_AVATAR = ["#6D49F2", "#F27C38", "#3B82C4", "#1F9D66", "#B4770A", "#C4362B"];
const conteudo = document.getElementById("conteudoAnalise");
const idVerificacao = new URLSearchParams(window.location.search).get("id");

const STATUS_UI = {
    pendente: { classe: "suspenso", label: "Em análise" },
    aprovado: { classe: "ativo",    label: "Aprovada" },
    rejeitado:{ classe: "inativo",  label: "Reprovada" }
};

STATUS_UI.cancelado = { classe: "suspenso", label: "Cancelada" }; // o usuário desistiu do envio

// Verificação revogada volta como "rejeitado" + revogada:true.
function uiStatus(v) {
    if (v.status === "rejeitado" && v.revogada) return { classe: "inativo", label: "Revogada" };
    return STATUS_UI[v.status] || { classe: "suspenso", label: v.status };
}

const TIPOS_DOCUMENTO = { rg: "RG", cnh: "CNH", passaporte: "Passaporte" };

const TODOS_DOCUMENTOS = [
    { chave: "frente", titulo: "Documento — frente" },
    { chave: "verso",  titulo: "Documento — verso" },
    { chave: "selfie", titulo: "Selfie com o documento" }
];

// Passaporte não tem verso: o usuário não envia e a tela não mostra o cartão vazio.
function documentosDe(v) {
    return TODOS_DOCUMENTOS.filter(d => !(d.chave === "verso" && v.tipo_documento === "passaporte"));
}

let verificacaoAtual = null;
let urlsImagens = []; // object URLs criadas nesta carga (liberadas na próxima)

// ================= HELPERS =================
function iniciais(nome) {
    return String(nome ?? "").split(" ").filter(Boolean).slice(0, 2).map(p => p[0].toUpperCase()).join("") || "?";
}

function corAvatar(id) {
    return CORES_AVATAR[[...String(id)].reduce((n, c) => n + c.charCodeAt(0), 0) % CORES_AVATAR.length];
}

function formatarData(iso) {
    if (!iso) return "—";
    // Mesmo comportamento da tela de detalhes: data pura não passa por Date (evita voltar um dia por fuso).
    if (/^\d{4}-\d{2}-\d{2}$/.test(iso)) {
        const [ano, mes, dia] = iso.split("-");
        return `${dia}/${mes}/${ano}`;
    }
    const d = new Date(iso);
    return Number.isNaN(d.getTime()) ? "—" : d.toLocaleDateString("pt-BR");
}

function formatarDataHora(iso) {
    if (!iso) return "—";
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return "—";
    return `${d.toLocaleDateString("pt-BR")} às ${d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}`;
}

// ================= CARREGAR =================
async function carregarAnalise() {
    if (!idVerificacao) {
        conteudo.innerHTML = `<p class="admin-tabela-vazio">Verificação não informada na URL.</p>`;
        return;
    }

    let v;
    try { v = await buscarVerificacaoAdminPorId(idVerificacao); }
    catch (err) {
        conteudo.innerHTML = `<p class="admin-tabela-vazio">${escAdmin(err.message)}</p>`;
        return;
    }

    verificacaoAtual = v;
    renderizar(v);
    carregarImagens(v.id ?? idVerificacao, documentosDe(v));
}

function renderizar(v) {
    const u = v.usuario || {};
    const ui = uiStatus(v);
    const pendente = v.status === "pendente";
    const contaSuspensa = u.ativo === false;
    const tentativa = Number(v.tentativa) > 1 ? ` · Tentativa nº ${Number(v.tentativa)}` : "";

    let blocoDecisao;
    if (pendente) {
        blocoDecisao = `
            <div class="analise-decisao">
                <p>Confira se o documento está legível e válido, se os dados conferem com o cadastro e se a selfie mostra a mesma pessoa segurando o documento.</p>
                <div class="analise-decisao-botoes">
                    <button class="admin-btn-perigo" id="btnReprovar" type="button"><i class="bi bi-x-circle"></i> Reprovar</button>
                    <button class="admin-btn-primario" id="btnAprovar" type="button"><i class="bi bi-patch-check"></i> Aprovar</button>
                </div>
            </div>`;
    } else if (v.status === "aprovado") {
        blocoDecisao = `
            <div class="analise-resultado aprovado com-acao">
                <div>
                    <strong>Verificação aprovada</strong>
                    <p>${v.decidido_em ? `Em ${formatarDataHora(v.decidido_em)}` : ""}${v.decidido_por_nome ? ` · por ${escAdmin(v.decidido_por_nome)}` : ""}</p>
                </div>
                <button class="admin-btn-perigo" id="btnRevogar" type="button"><i class="bi bi-patch-minus"></i> Revogar</button>
            </div>`;
    } else if (v.status === "cancelado") {
        blocoDecisao = `
            <div class="analise-resultado rejeitado">
                <strong>Envio cancelado pelo usuário</strong>
                <p>O usuário desistiu desta análise e pode enviar novos documentos.</p>
            </div>`;
    } else {
        const revogada = ui.label === "Revogada";
        blocoDecisao = `
            <div class="analise-resultado rejeitado">
                <strong>Verificação ${revogada ? "revogada" : "reprovada"}${v.decidido_em ? ` em ${formatarDataHora(v.decidido_em)}` : ""}${v.decidido_por_nome ? ` por ${escAdmin(v.decidido_por_nome)}` : ""}</strong>
                <p>${escAdmin(v.motivo || "Sem motivo registrado.")}</p>
            </div>`;
    }

    // Conta suspensa com verificação na fila: o admin decide com essa informação à vista.
    const avisoSuspensa = contaSuspensa && pendente ? `
            <div class="analise-aviso">
                <i class="bi bi-exclamation-triangle-fill"></i>
                <span>Esta conta está suspensa. Confirme se a verificação ainda faz sentido antes de aprovar.</span>
            </div>` : "";

    conteudo.innerHTML = `
        <div class="detalhe-cabecalho">
            <div class="detalhe-avatar" style="background:${corAvatar(u.id ?? v.id)}">${window.avatarAdminHtml ? window.avatarAdminHtml(u.avatarUrl ?? u.avatar_url, iniciais(u.nome)) : escAdmin(iniciais(u.nome))}</div>
            <div class="detalhe-info">
                <h1>${escAdmin(u.nome || "Usuário")} <span class="admin-badge ${ui.classe}">${ui.label}</span></h1>
                <p>Enviado em ${formatarDataHora(v.criado_em)}${tentativa}</p>
            </div>
            ${u.id ? `<div class="detalhe-acoes">
                <a class="admin-btn-secundario" href="/admin/usuarios/detalhe?id=${encodeURIComponent(u.id)}"><i class="bi bi-person"></i> Ver usuário</a>
            </div>` : ""}
        </div>

        <div class="detalhe-grid-info">
            <div class="detalhe-campo"><span>Email</span><strong>${escAdmin(u.email || "—")}</strong></div>
            <div class="detalhe-campo"><span>Tipo</span><strong>${u.tipo === "admin" ? "Administrador" : "Usuário"}</strong></div>
            <div class="detalhe-campo"><span>Conta</span><strong>${u.ativo === false ? "Inativo" : "Ativo"}</strong></div>
            <div class="detalhe-campo"><span>Data de Cadastro</span><strong>${formatarData(u.criado_em)}</strong></div>
            ${TIPOS_DOCUMENTO[v.tipo_documento] ? `<div class="detalhe-campo"><span>Documento enviado</span><strong>${TIPOS_DOCUMENTO[v.tipo_documento]}</strong></div>` : ""}
        </div>

        <section class="detalhe-secao">
            <h2>Documentos enviados</h2>
            <div class="analise-docs">
                ${documentosDe(v).map(d => `
                <figure class="analise-doc" style="margin:0">
                    <figcaption>${d.titulo}</figcaption>
                    <button type="button" class="analise-doc-imagem" data-doc="${d.chave}" disabled>
                        <span class="analise-doc-status">Carregando imagem...</span>
                        <img alt="${d.titulo}" hidden>
                    </button>
                </figure>`).join("")}
            </div>
        </section>

        <section class="detalhe-secao">
            <h2>Decisão</h2>
            ${avisoSuspensa}
            ${blocoDecisao}
        </section>
    `;

    if (pendente) {
        document.getElementById("btnAprovar").addEventListener("click", abrirModalAprovar);
        document.getElementById("btnReprovar").addEventListener("click", abrirModalReprovar);
    }
    const btnRevogar = document.getElementById("btnRevogar");
    if (btnRevogar) btnRevogar.addEventListener("click", abrirModalRevogar);

    conteudo.querySelectorAll(".analise-doc-imagem").forEach(botao => {
        botao.addEventListener("click", () => {
            const img = botao.querySelector("img");
            if (!img.hidden && img.src) abrirImagem(img.src, img.alt);
        });
    });
}

// Busca as 3 imagens em paralelo; uma falha não derruba as outras.
function carregarImagens(id, documentos) {
    urlsImagens.forEach(url => URL.revokeObjectURL(url));
    urlsImagens = [];

    documentos.forEach(async (d) => {
        const botao = conteudo.querySelector(`.analise-doc-imagem[data-doc="${d.chave}"]`);
        if (!botao) return;
        const status = botao.querySelector(".analise-doc-status");
        const img = botao.querySelector("img");

        try {
            const url = await baixarArquivoVerificacaoAdmin(id, d.chave);
            urlsImagens.push(url);
            img.src = url;
            img.hidden = false;
            status.hidden = true;
            botao.disabled = false;
        } catch (err) {
            status.textContent = err.message;
            botao.classList.add("erro");
        }
    });
}

// ================= MODAIS =================
const modalAprovar = document.getElementById("modalAprovarOverlay");
const modalReprovar = document.getElementById("modalReprovarOverlay");
const modalImagem = document.getElementById("modalImagemOverlay");
const modalRevogar = document.getElementById("modalRevogarOverlay");
const erroRevogar = document.getElementById("modalRevogarErro");
const btnConfirmarRevogar = document.getElementById("modalRevogarConfirmar");
const campoMotivoRevogar = document.getElementById("modalRevogarMotivo");

const erroAprovar = document.getElementById("modalAprovarErro");
const erroReprovar = document.getElementById("modalReprovarErro");
const btnConfirmarAprovar = document.getElementById("modalAprovarConfirmar");
const btnConfirmarReprovar = document.getElementById("modalReprovarConfirmar");
const campoMotivo = document.getElementById("modalReprovarMotivo");

function nomeDoUsuario() {
    return verificacaoAtual?.usuario?.nome || "este usuário";
}

function abrirModalAprovar() {
    document.getElementById("modalAprovarNome").textContent = nomeDoUsuario();
    erroAprovar.textContent = "";
    btnConfirmarAprovar.disabled = false;
    modalAprovar.hidden = false;
}

function abrirModalReprovar() {
    document.getElementById("modalReprovarNome").textContent = nomeDoUsuario();
    erroReprovar.textContent = "";
    campoMotivo.value = "";
    btnConfirmarReprovar.disabled = false;
    modalReprovar.hidden = false;
    campoMotivo.focus();
}

function abrirModalRevogar() {
    document.getElementById("modalRevogarNome").textContent = nomeDoUsuario();
    erroRevogar.textContent = "";
    campoMotivoRevogar.value = "";
    btnConfirmarRevogar.disabled = false;
    modalRevogar.hidden = false;
    campoMotivoRevogar.focus();
}

function abrirImagem(src, alt) {
    const img = document.getElementById("modalImagemImg");
    img.src = src;
    img.alt = alt || "";
    modalImagem.hidden = false;
}

function fecharModais() {
    modalAprovar.hidden = true;
    modalReprovar.hidden = true;
    modalRevogar.hidden = true;
    modalImagem.hidden = true;
}

document.getElementById("modalAprovarCancelar").addEventListener("click", fecharModais);
document.getElementById("modalReprovarCancelar").addEventListener("click", fecharModais);
document.getElementById("modalImagemFechar").addEventListener("click", fecharModais);
document.getElementById("modalRevogarCancelar").addEventListener("click", fecharModais);

[modalAprovar, modalReprovar, modalRevogar, modalImagem].forEach(overlay => {
    overlay.addEventListener("click", (e) => { if (e.target === overlay) fecharModais(); });
});

document.addEventListener("keydown", (e) => { if (e.key === "Escape") fecharModais(); });

// Motivos rápidos: preenchem (ou completam) o texto, que continua editável.
document.getElementById("motivosRapidos").addEventListener("click", (e) => {
    const botao = e.target.closest("button[data-motivo]");
    if (!botao) return;
    const atual = campoMotivo.value.trim();
    const novo = atual ? `${atual} ${botao.dataset.motivo}` : botao.dataset.motivo;
    campoMotivo.value = novo.slice(0, campoMotivo.maxLength);
    campoMotivo.focus();
});

// ================= DECIDIR =================
async function decidir(aprovar, motivo, botao, erroEl, revogar = false) {
    erroEl.textContent = "";
    botao.disabled = true;

    try {
        if (revogar) await revogarVerificacaoAdmin(idVerificacao, motivo);
        else await decidirVerificacaoAdmin(idVerificacao, aprovar, motivo);
    } catch (err) {
        // Ex.: 409 se outro admin já decidiu essa verificação.
        erroEl.textContent = err.message;
        botao.disabled = false;
        return;
    }

    fecharModais();
    window.mostrarToastAdmin(revogar ? "Verificação revogada" : (aprovar ? "Verificação aprovada" : "Verificação reprovada"), "sucesso");
    carregarAnalise();
    // O contador de pendentes na sidebar mudou.
    if (typeof window.atualizarBadgeVerificacoes === "function") window.atualizarBadgeVerificacoes();
}

btnConfirmarAprovar.addEventListener("click", () => {
    decidir(true, "", btnConfirmarAprovar, erroAprovar);
});

btnConfirmarReprovar.addEventListener("click", () => {
    const motivo = campoMotivo.value.trim();
    if (motivo.length < 5) {
        erroReprovar.textContent = "Informe o motivo da reprovação (mín. 5 caracteres). O usuário verá esse texto.";
        return;
    }
    decidir(false, motivo, btnConfirmarReprovar, erroReprovar);
});

btnConfirmarRevogar.addEventListener("click", () => {
    const motivo = campoMotivoRevogar.value.trim();
    if (motivo.length < 5) {
        erroRevogar.textContent = "Informe o motivo da revogação (mín. 5 caracteres). O usuário verá esse texto.";
        return;
    }
    decidir(false, motivo, btnConfirmarRevogar, erroRevogar, true);
});

carregarAnalise();