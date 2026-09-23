/**
 * admin-anuncio-acoes.js
 * ------------------------------------------------------------------
 * Três modais de moderação de anúncio:
 *
 *   - "Ver anúncio": mostra todos os dados do anúncio (fotos, descrição,
 *     localização, proprietário, categoria, preço, disponibilidade) pro
 *     admin analisar antes de decidir alterar visibilidade ou arquivar.
 *   - "Alterar visibilidade": alterna o boolean `disponivel`; ocultar
 *     exige motivo e não altera dados comerciais do proprietário.
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
                    <label for="admModalStatusAnuncioSelect">Disponibilidade</label>
                    <select id="admModalStatusAnuncioSelect">
                        <option value="disponivel">Disponível</option>
                        <option value="indisponivel">Indisponível</option>
                    </select>
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
    document.getElementById("admModalVerAnuncioDisponibilidade").textContent = anuncio.emLocacao
        ? "Em locação"
        : anuncio.solicitacaoPendente
            ? "Solicitação pendente"
            : (anuncio.disponivel ? "Disponível" : "Pausado pelo dono");
    document.getElementById("admModalVerAnuncioStatus").textContent = labelStatusAnuncio(anuncio.status);
    document.getElementById("admModalVerAnuncioDescricao").textContent = anuncio.descricao || "Sem descrição.";

    document.getElementById("admModalVerAnuncioOverlay").hidden = false;
}

function fecharModalVerAnuncio() {
    document.getElementById("admModalVerAnuncioOverlay").hidden = true;
}

// ================= ALTERAR STATUS =================
function abrirModalStatusAnuncio(anuncio, aoConfirmar) {
    garantirModaisAnuncio();

    _anuncioStatusAtual = anuncio;
    _callbackStatusAnuncio = aoConfirmar;

    document.getElementById("admModalStatusAnuncioTitulo").textContent = anuncio.titulo;
    document.getElementById("admModalStatusAnuncioSelect").value = anuncio.disponivel ? "disponivel" : "indisponivel";
    document.getElementById("admModalStatusAnuncioMotivo").value = "";
    document.getElementById("admModalStatusAnuncioErro").textContent = "";
    atualizarObrigatoriedadeMotivoAnuncio();

    document.getElementById("admModalStatusAnuncioOverlay").hidden = false;

    const btn = document.getElementById("admModalStatusAnuncioConfirmar");
    const btnNovo = btn.cloneNode(true);
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
