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
    const [ano, mes, dia] = iso.slice(0, 10).split("-");
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
    usuario = { ...usuario, status: usuario.ativo ? 'ativo' : 'inativo', dataCadastro: usuario.criado_em };
    renderizarDetalhe(usuario);
}

function renderizarDetalhe(usuario) {
    const estatisticas = usuario.estatisticas || {};

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
            <div class="detalhe-campo"><span>Tipo</span><strong>${usuario.tipo === 'admin' ? 'Administrador' : 'Usuário'}</strong></div>
            <div class="detalhe-campo"><span>Verificação</span><strong>${usuario.verificado ? 'Verificado' : 'Não verificado'}</strong></div>
            <div class="detalhe-campo"><span>Data de Cadastro</span><strong>${formatarData(usuario.dataCadastro)}</strong></div>
        </div>

        <section class="detalhe-secao">
            <h2>Itens anunciados</h2>
            <div class="admin-card">
                <p class="admin-tabela-vazio">${Number(estatisticas.objetos || 0)} objeto(s) cadastrado(s).</p>
            </div>
        </section>

        <section class="detalhe-secao">
            <h2>Histórico de aluguéis</h2>
            <div class="admin-card">
                <p class="admin-tabela-vazio">Como locatário: ${Number(estatisticas.alugueis_como_locatario || 0)} · Como proprietário: ${Number(estatisticas.alugueis_como_proprietario || 0)}</p>
            </div>
        </section>

        <section class="detalhe-secao">
            <h2>Denúncias recebidas</h2>
            <div class="admin-card">
                <p class="admin-tabela-vazio">${Number(estatisticas.denuncias_recebidas || 0)} denúncia(s) recebida(s).</p>
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
