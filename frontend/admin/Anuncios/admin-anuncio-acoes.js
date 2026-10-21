/**
 * admin-anuncio-acoes.js
 * ------------------------------------------------------------------
 * Três modais de moderação de anúncio:
 *
 *   - "Ver anúncio": mostra todos os dados do anúncio (fotos, descrição,
 *     localização, proprietário, categoria, preço, disponibilidade) pro
 *     admin analisar antes de decidir alterar visibilidade ou arquivar.
 *   - "Alterar visibilidade": oculta/reexibe pela moderação (`oculto_pelo_admin`);
 *     ocultar exige motivo e NÃO sobrescreve a preferência `disponivel` do dono.
 *   - "Arquivar anúncio": arquivamento administrativo, nunca hard-delete.
 *
 * Uso:
 *   abrirModalVerAnuncio(anuncio);
 *   abrirModalStatusAnuncio(anuncio, (novoStatus) => { ...recarregar... });
 *   abrirModalExcluirAnuncio(anuncio, () => { ...recarregar/redirecionar... });
 *
 * Depende de:
 *   - admin-api.js desta pasta (alterarVisibilidadeAnuncioAdmin, arquivarAnuncioAdmin)
 *   - window.mostrarToastAdmin (definido em admin-frame.js)
 *
 * O modal de detalhe recebe dados de GET /objetos/:id, rota canônica já
 * autorizada para administradores inclusive quando o item está arquivado.
 * ------------------------------------------------------------------
 */

const escAdminAcoes = valor => String(valor ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"})[c]);

let _anuncioStatusAtual = null;
let _callbackStatusAnuncio = null;
let _anuncioExcluirAtual = null;
let _callbackExcluirAnuncio = null;
let _tokenAvalVerAnuncio = 0; // descarta resposta de avaliação se o admin trocar/fechar o modal antes dela chegar

function labelStatusAnuncio(status) {
    return { ativo: "Ativo", arquivado: "Arquivado" }[status] || status;
}

function garantirModaisAnuncio() {
    if (document.getElementById("admModalStatusAnuncioOverlay")) return;

    const wrapper = document.createElement("div");
    wrapper.innerHTML = `
        <div class="admin-modal-overlay" id="admModalVerAnuncioOverlay" hidden>
            <div class="admin-modal admin-modal-grande">
                <h3 id="admModalVerAnuncioTitulo"></h3>

                <div class="admin-ver-anuncio-galeria" id="admModalVerAnuncioGaleria"></div>

                <div class="admin-ver-anuncio-grid">
                    <div><span>Proprietário</span><strong id="admModalVerAnuncioProprietario"></strong></div>
                    <div><span>Categoria</span><strong id="admModalVerAnuncioCategoria"></strong></div>
                    <div><span>Preço/dia</span><strong id="admModalVerAnuncioPreco"></strong></div>
                    <div><span>Localização</span><strong id="admModalVerAnuncioLocalizacao"></strong></div>
                    <div><span>Disponibilidade</span><strong id="admModalVerAnuncioDisponibilidade"></strong></div>
                    <div><span>Status</span><strong id="admModalVerAnuncioStatus"></strong></div>
                </div>

                <div class="admin-ver-anuncio-descricao">
                    <span>Descrição</span>
                    <p id="admModalVerAnuncioDescricao"></p>
                </div>

                <div class="admin-ver-anuncio-avaliacoes">
                    <span>Avaliações</span>
                    <div id="admModalVerAnuncioAvalResumo"></div>
                    <div id="admModalVerAnuncioAvalLista"></div>
                </div>

                <div class="admin-modal-botoes">
                    <button class="admin-btn-secundario" id="admModalVerAnuncioFechar">Fechar</button>
                </div>
            </div>
        </div>

        <div class="admin-modal-overlay" id="admModalStatusAnuncioOverlay" hidden>
            <div class="admin-modal">
                <h3>Alterar visibilidade</h3>
                <p>Anúncio: <strong id="admModalStatusAnuncioTitulo"></strong></p>

                <div class="admin-form-campo">
                    <label for="admModalStatusAnuncioSelect">Visibilidade (moderação)</label>
                    <select id="admModalStatusAnuncioSelect">
                        <option value="disponivel">Visível</option>
                        <option value="indisponivel">Ocultar pela moderação</option>
                    </select>
                    <small id="admModalStatusAnuncioNota" style="display:block;margin-top:6px;font-size:12.5px;color:var(--admin-texto-muted)"></small>
                </div>

                <div class="admin-form-campo">
                    <label for="admModalStatusAnuncioMotivo">
                        Motivo <span id="admModalStatusAnuncioMotivoObrig">(obrigatório)</span>
                    </label>
                    <textarea id="admModalStatusAnuncioMotivo" rows="3"
                        placeholder="Registre o motivo administrativo da ocultação."></textarea>
                </div>

                <p class="admin-form-erro" id="admModalStatusAnuncioErro"></p>

                <div class="admin-modal-botoes">
                    <button class="admin-btn-secundario" id="admModalStatusAnuncioCancelar">Cancelar</button>
                    <button class="admin-btn-primario" id="admModalStatusAnuncioConfirmar">Confirmar</button>
                </div>
            </div>
        </div>

        <div class="admin-modal-overlay" id="admModalExcluirAnuncioOverlay" hidden>
            <div class="admin-modal">
                <h3>Arquivar anúncio</h3>
                <p>Tem certeza que deseja arquivar <strong id="admModalExcluirAnuncioTitulo"></strong>?
                   O item deixará de aparecer no catálogo.</p>

                <div class="admin-form-campo" id="admModalExcluirAnuncioMotivoCampo">
                    <label for="admModalExcluirAnuncioMotivo">
                        Motivo <span>(obrigatório)</span>
                    </label>
                    <textarea id="admModalExcluirAnuncioMotivo" rows="3"
                        placeholder="Registre o motivo administrativo do arquivamento."></textarea>
                </div>

                <p class="admin-form-erro" id="admModalExcluirAnuncioErro"></p>

                <div class="admin-modal-botoes" id="admModalExcluirAnuncioBotoesPadrao">
                    <button class="admin-btn-secundario" id="admModalExcluirAnuncioCancelar">Cancelar</button>
                    <button class="admin-btn-perigo" id="admModalExcluirAnuncioConfirmar">Arquivar</button>
                </div>
            </div>
        </div>
    `;
    document.body.appendChild(wrapper);

    document.getElementById("admModalVerAnuncioFechar").addEventListener("click", fecharModalVerAnuncio);
    document.getElementById("admModalStatusAnuncioCancelar").addEventListener("click", fecharModalStatusAnuncio);
    document.getElementById("admModalExcluirAnuncioCancelar").addEventListener("click", fecharModalExcluirAnuncio);
    document.getElementById("admModalStatusAnuncioSelect").addEventListener("change", atualizarObrigatoriedadeMotivoAnuncio);
}

function atualizarObrigatoriedadeMotivoAnuncio() {
    const select = document.getElementById("admModalStatusAnuncioSelect");
    const aviso = document.getElementById("admModalStatusAnuncioMotivoObrig");
    aviso.style.display = select.value === "indisponivel" ? "inline" : "none";
}

// ================= VER ANÚNCIO =================
function formatarPrecoAcoes(valor) {
    return valor === undefined || valor === null || valor === ""
        ? "—"
        : `R$ ${Number(valor).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function abrirModalVerAnuncio(anuncio) {
    garantirModaisAnuncio();

    document.getElementById("admModalVerAnuncioTitulo").textContent = anuncio.titulo;

    const fotos = (anuncio.fotos_item || anuncio.imagens || [])
        .map(f => (typeof f === "string" ? f : f?.url))
        .filter(Boolean);

    const galeriaEl = document.getElementById("admModalVerAnuncioGaleria");
    galeriaEl.innerHTML = fotos.length
        ? fotos.map(url => `<div class="admin-ver-anuncio-foto" style="background-image:url('${escAdminAcoes(url)}')"></div>`).join("")
        : `<p class="admin-ver-anuncio-sem-fotos">Este anúncio não tem fotos.</p>`;

    document.getElementById("admModalVerAnuncioProprietario").textContent = anuncio.proprietarioNome || "—";
    document.getElementById("admModalVerAnuncioCategoria").textContent = anuncio.categoria || "—";
    document.getElementById("admModalVerAnuncioPreco").textContent = formatarPrecoAcoes(anuncio.preco_dia);
    document.getElementById("admModalVerAnuncioLocalizacao").textContent = anuncio.localizacao || "Não informado";
    // Mesmos nomes de campo que o back manda em /objetos (snake_case) — ver
    // objetos-shared.js e o comentário em anuncios.js:infoDisponibilidade.
    document.getElementById("admModalVerAnuncioDisponibilidade").textContent = anuncio.status === "arquivado"
        ? "Arquivado"
        : anuncio.oculto_pelo_admin
        ? "Oculto pela moderação"
        : anuncio.em_locacao ? "Em locação"
        : anuncio.tem_solicitacao_pendente
            ? "Solicitação pendente"
            : (anuncio.disponivel ? "Disponível" : "Pausado pelo dono");
    document.getElementById("admModalVerAnuncioStatus").textContent = labelStatusAnuncio(anuncio.status);
    document.getElementById("admModalVerAnuncioDescricao").textContent = anuncio.descricao || "Sem descrição.";

    document.getElementById("admModalVerAnuncioOverlay").hidden = false;

    carregarAvaliacoesVerAnuncio(anuncio.id);
}

function fecharModalVerAnuncio() {
    document.getElementById("admModalVerAnuncioOverlay").hidden = true;
    _tokenAvalVerAnuncio++; // invalida qualquer busca de avaliação ainda em andamento
}

// Busca é separada da abertura do modal (não trava o "Ver anúncio" esperando
// as avaliações): mostra "Carregando..." e substitui quando a resposta chega,
// só se o modal ainda estiver mostrando o MESMO anúncio (token evita que a
// resposta de um clique antigo sobrescreva o anúncio aberto depois).
async function carregarAvaliacoesVerAnuncio(anuncioId) {
    const meuToken = ++_tokenAvalVerAnuncio;
    const resumoEl = document.getElementById("admModalVerAnuncioAvalResumo");
    const listaEl = document.getElementById("admModalVerAnuncioAvalLista");

    resumoEl.innerHTML = "";
    listaEl.innerHTML = `<p class="admin-ver-anuncio-aval-vazio">Carregando avaliações...</p>`;

    let media = 0, total = 0, lista = [];
    try {
        ({ media, total, lista } = await obterAvaliacoesAnuncioAdmin(anuncioId));
    } catch (err) {
        if (meuToken !== _tokenAvalVerAnuncio) return;
        listaEl.innerHTML = `<p class="admin-ver-anuncio-aval-vazio">Não foi possível carregar as avaliações.</p>`;
        return;
    }
    if (meuToken !== _tokenAvalVerAnuncio) return; // admin já trocou/fechou o modal

    if (total > 0) {
        const estrelasCheias = Math.round(media);
        let estrelasHTML = "";
        for (let i = 1; i <= 5; i++) {
            estrelasHTML += `<i class="bi ${i <= estrelasCheias ? "bi-star-fill" : "bi-star"}"></i>`;
        }
        resumoEl.innerHTML = `
            <div class="admin-ver-anuncio-aval-resumo-box">
                <span class="admin-ver-anuncio-aval-nota">${media.toFixed(1)}</span>
                <div class="admin-ver-anuncio-aval-detalhes">
                    <span class="admin-ver-anuncio-aval-estrelas">${estrelasHTML}</span>
                    <span class="admin-ver-anuncio-aval-total">${total} avaliação${total > 1 ? "ões" : ""}</span>
                </div>
            </div>
        `;
    }

    if (total === 0) {
        listaEl.innerHTML = `<p class="admin-ver-anuncio-aval-vazio">Este anúncio ainda não recebeu avaliações.</p>`;
        return;
    }

    listaEl.innerHTML = lista
        .slice()
        .sort((a, b) => new Date(b.data) - new Date(a.data))
        .map(av => {
            const nome = av.nomeAvaliador || "Usuário";
            const inicial = nome.charAt(0).toUpperCase().replace(/[^\p{L}\p{N}]/gu, "?");
            const data = av.data ? new Date(av.data).toLocaleDateString("pt-BR") : "";
            const nota = Number(av.nota).toFixed(1);
            return `
                <div class="admin-ver-anuncio-aval-item">
                    <div class="admin-ver-anuncio-aval-topo">
                        <div class="admin-ver-anuncio-aval-avatar">${window.avatarAdminHtml ? window.avatarAdminHtml(av.avaliadorAvatarUrl, inicial) : inicial}</div>
                        <div class="admin-ver-anuncio-aval-info">
                            <strong>${escAdminAcoes(nome)}</strong>
                            <span class="admin-ver-anuncio-aval-data">${data}</span>
                        </div>
                        <div class="admin-ver-anuncio-aval-nota-pill"><i class="bi bi-star-fill"></i> ${nota}</div>
                    </div>
                    ${av.comentario ? `<p class="admin-ver-anuncio-aval-comentario">${escAdminAcoes(av.comentario)}</p>` : ""}
                </div>
            `;
        }).join("");
}

// ================= ALTERAR STATUS =================
function abrirModalStatusAnuncio(anuncio, aoConfirmar) {
    garantirModaisAnuncio();

    _anuncioStatusAtual = anuncio;
    _callbackStatusAnuncio = aoConfirmar;

    document.getElementById("admModalStatusAnuncioTitulo").textContent = anuncio.titulo;
    // Só a ocultação administrativa conta aqui: `disponivel` é a preferência do dono e não é alterada pela moderação.
    document.getElementById("admModalStatusAnuncioSelect").value = anuncio.oculto_pelo_admin ? "indisponivel" : "disponivel";
    const notaEl = document.getElementById("admModalStatusAnuncioNota");
    const notas = [];
    if (anuncio.oculto_pelo_admin && anuncio.motivo_ocultacao) notas.push(`Motivo atual da ocultação: ${anuncio.motivo_ocultacao}`);
    if (anuncio.disponivel === false) notas.push("O proprietário pausou este anúncio; isso continua valendo mesmo se você reexibir.");
    notaEl.textContent = notas.join(" ");
    document.getElementById("admModalStatusAnuncioMotivo").value = "";
    document.getElementById("admModalStatusAnuncioErro").textContent = "";
    atualizarObrigatoriedadeMotivoAnuncio();

    document.getElementById("admModalStatusAnuncioOverlay").hidden = false;

    const btn = document.getElementById("admModalStatusAnuncioConfirmar");
    const btnNovo = btn.cloneNode(true);
    btnNovo.disabled = false; // cloneNode copia o `disabled` deixado pela confirmação anterior
    btn.replaceWith(btnNovo);
    btnNovo.addEventListener("click", confirmarModalStatusAnuncio);
}

function fecharModalStatusAnuncio() {
    document.getElementById("admModalStatusAnuncioOverlay").hidden = true;
    _anuncioStatusAtual = null;
    _callbackStatusAnuncio = null;
}

async function confirmarModalStatusAnuncio() {
    const novoStatus = document.getElementById("admModalStatusAnuncioSelect").value;
    const disponivel = novoStatus === "disponivel";
    const motivo = document.getElementById("admModalStatusAnuncioMotivo").value.trim();
    const erroEl = document.getElementById("admModalStatusAnuncioErro");
    erroEl.textContent = "";

    if (!disponivel && !motivo) {
        erroEl.textContent = "Informe o motivo da ocultação.";
        return;
    }

    // Reexibir só faz sentido se o anúncio está oculto pela moderação; senão não há nada a desfazer
    // (e enviar disponivel:true poderia mexer na preferência do dono).
    if (disponivel && !_anuncioStatusAtual.oculto_pelo_admin) {
        erroEl.textContent = "Este anúncio não está oculto pela moderação. Escolha \"Ocultar pela moderação\" ou cancele.";
        return;
    }

    const botao = document.getElementById('admModalStatusAnuncioConfirmar');
    botao.disabled = true;
    try { await alterarVisibilidadeAnuncioAdmin(_anuncioStatusAtual.id, disponivel, motivo); }
    catch (err) { erroEl.textContent = err.message; botao.disabled = false; return; }
    window.mostrarToastAdmin(
        `Visibilidade de "${_anuncioStatusAtual.titulo}" atualizada`,
        "sucesso"
    );

    const callback = _callbackStatusAnuncio;
    const anuncioAlterado = _anuncioStatusAtual;
    fecharModalStatusAnuncio();
    if (callback) callback(novoStatus, motivo, anuncioAlterado);
}

// ================= EXCLUIR =================
function abrirModalExcluirAnuncio(anuncio, aoConfirmar) {
    garantirModaisAnuncio();

    _anuncioExcluirAtual = anuncio;
    _callbackExcluirAnuncio = aoConfirmar;

    document.getElementById("admModalExcluirAnuncioTitulo").textContent = anuncio.titulo;
    document.getElementById("admModalExcluirAnuncioMotivo").value = "";
    document.getElementById("admModalExcluirAnuncioErro").textContent = "";
    document.getElementById("admModalExcluirAnuncioOverlay").hidden = false;

    const btn = document.getElementById("admModalExcluirAnuncioConfirmar");
    const btnNovo = btn.cloneNode(true);
    btnNovo.disabled = false; // idem: não herdar o `disabled` do arquivamento anterior
    btn.replaceWith(btnNovo);
    btnNovo.addEventListener("click", confirmarModalExcluirAnuncio);

}

function fecharModalExcluirAnuncio() {
    document.getElementById("admModalExcluirAnuncioOverlay").hidden = true;
    _anuncioExcluirAtual = null;
    _callbackExcluirAnuncio = null;
}

async function confirmarModalExcluirAnuncio() {
    const anuncio = _anuncioExcluirAtual;
    const motivo = document.getElementById("admModalExcluirAnuncioMotivo").value.trim();
    const erroEl = document.getElementById("admModalExcluirAnuncioErro");
    erroEl.textContent = "";

    if (!motivo) {
        erroEl.textContent = "Informe o motivo do arquivamento.";
        return;
    }

    const botao = document.getElementById("admModalExcluirAnuncioConfirmar");
    botao.disabled = true;
    try {
        await arquivarAnuncioAdmin(anuncio.id, motivo);
    } catch (err) {
        botao.disabled = false;
        erroEl.textContent = err.message;
        return;
    }

    window.mostrarToastAdmin(`"${anuncio.titulo}" foi arquivado`, "sucesso");

    const callback = _callbackExcluirAnuncio;
    fecharModalExcluirAnuncio();
    if (callback) callback();
}