const escAdmin = valor => String(valor ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"})[c]);


const CORES_AVATAR = ["#6D49F2", "#F27C38", "#3B82C4", "#1F9D66", "#B4770A", "#C4362B"];
const conteudo = document.getElementById("conteudoDetalhe");

const params = new URLSearchParams(window.location.search);
const idUsuario = params.get("id");

function iniciais(nome) {
    return nome.split(" ").filter(Boolean).slice(0, 2).map(p => p[0].toUpperCase()).join("") || "?";
}

function corAvatar(id) {
    const indice = [...String(id)].reduce((soma, caractere) => soma + caractere.charCodeAt(0), 0);
    return CORES_AVATAR[indice % CORES_AVATAR.length];
}

function formatarData(iso) {
    if (!iso) return "—";
    const [ano, mes, dia] = iso.split("-");
    return `${dia}/${mes}/${ano}`;
}

function labelStatus(status) {
    return { ativo: "Ativo", inativo: "Inativo" }[status] || status;
}

async function carregarDetalhe() {
    if (!idUsuario) {
        conteudo.innerHTML = `<p class="admin-tabela-vazio">Usuário não informado na URL.</p>`;
        return;
    }

    let usuario;
    try { usuario = await buscarUsuarioAdminPorId(idUsuario); }
    catch (err) { conteudo.textContent = err.message; return; }
    if (!usuario) { conteudo.textContent = 'Usuário não encontrado na listagem administrativa.'; return; }
    usuario = { ...usuario, status: usuario.ativo ? 'ativo' : 'inativo', dataCadastro: usuario.criado_em };
    renderizarDetalhe(usuario);
}

function renderizarDetalhe(usuario) {
    const itens = usuario.itensAnunciados || [];
    const alugueis = usuario.historicoAlugueis || [];
    const denuncias = usuario.denuncias || [];

    conteudo.innerHTML = `
        <div class="detalhe-cabecalho">
            <div class="detalhe-avatar" style="background:${corAvatar(usuario.id)}">${iniciais(usuario.nome)}</div>
            <div class="detalhe-info">
                <h1>${escAdmin(usuario.nome)} <span class="admin-badge ${usuario.status}">${labelStatus(usuario.status)}</span></h1>
                <p>Cadastrado em ${formatarData(usuario.dataCadastro)}</p>
            </div>
            <div class="detalhe-acoes">
                <button class="admin-btn-secundario" id="btnAlterarStatus"><i class="bi bi-shield-lock"></i> Alterar status</button>
                
                <button class="admin-btn-perigo" id="btnExcluir"><i class="bi bi-trash"></i> Excluir</button>
            </div>
        </div>

        <div class="detalhe-grid-info">
            <div class="detalhe-campo"><span>Email</span><strong>${escAdmin(usuario.email)}</strong></div>
            <div class="detalhe-campo"><span>CPF</span><strong>Não disponível nesta rota</strong></div>
            <div class="detalhe-campo"><span>Telefone</span><strong>Não disponível nesta rota</strong></div>
            <div class="detalhe-campo"><span>Data de Cadastro</span><strong>${formatarData(usuario.dataCadastro)}</strong></div>
        </div>

        <section class="detalhe-secao">
            <h2>Itens anunciados</h2>
            <div class="admin-card">
                ${itens.length
                    ? `<ul class="detalhe-lista">${itens.map(i => `
                        <li class="detalhe-item-linha">
                            <span>${i.nome}</span>
                            <span class="muted">${i.status}</span>
                        </li>`).join("")}</ul>`
                    : `<p class="admin-tabela-vazio">Dados não disponíveis nesta rota.</p>`
                }
            </div>
        </section>

        <section class="detalhe-secao">
            <h2>Histórico de aluguéis</h2>
            <div class="admin-card">
                ${alugueis.length
                    ? `<ul class="detalhe-lista">${alugueis.map(a => `
                        <li class="detalhe-item-linha">
                            <span>${a.item} <span class="muted">— ${a.papel}</span></span>
                            <span class="muted">${formatarData(a.data)} · ${a.situacao}</span>
                        </li>`).join("")}</ul>`
                    : `<p class="admin-tabela-vazio">Dados não disponíveis nesta rota.</p>`
                }
            </div>
        </section>

        <section class="detalhe-secao">
            <h2>Denúncias recebidas</h2>
            <div class="admin-card">
                ${denuncias.length
                    ? `<ul class="detalhe-lista">${denuncias.map(d => `
                        <li class="detalhe-item-linha">
                            <span>${d.motivo}</span>
                            <span class="muted">${formatarData(d.data)} · ${d.status}</span>
                        </li>`).join("")}</ul>`
                    : `<p class="admin-tabela-vazio">Dados não disponíveis nesta rota.</p>`
                }
            </div>
        </section>
    `;

    document.getElementById("btnAlterarStatus").addEventListener("click", () => {
        abrirModalStatus(usuario, () => carregarDetalhe());
    });

    document.getElementById("btnExcluir").addEventListener("click", () => {
        abrirModalExcluir(usuario, () => {
            window.location.href = "/admin/usuarios";
        });
    });
}

carregarDetalhe();
