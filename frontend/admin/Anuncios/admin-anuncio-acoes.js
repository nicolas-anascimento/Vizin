/**
 * admin-anuncio-acoes.js
 * ------------------------------------------------------------------
 * Modal de "alterar status" (ativo/removido, com motivo obrigatório ao
 * remover) e modal de "excluir anúncio". Mesmo padrão de
 * admin-usuario-acoes.js (Usuarios/), só que para anúncios.
 *
 * Status é só ciclo de vida (ativo = publicado, removido = admin
 * excluiu/baniu o anúncio) — não existe etapa de aprovação/moderação.
 *
 * Uso:
 *   abrirModalStatusAnuncio(anuncio, (novoStatus) => { ...recarregar... });
 *   abrirModalExcluirAnuncio(anuncio, () => { ...recarregar/redirecionar... });
 *
 * Depende de:
 *   - admin-api.js desta pasta (alterarStatusAnuncioAdmin, excluirAnuncioAdmin)
 *   - window.mostrarToastAdmin (definido em admin-frame.js)
 * ------------------------------------------------------------------
 */

let _anuncioStatusAtual = null;
let _callbackStatusAnuncio = null;
let _anuncioExcluirAtual = null;
let _callbackExcluirAnuncio = null;

function labelStatusAnuncio(status) {
    return { ativo: "Ativo", oculto: "Oculto", arquivado: "Arquivado" }[status] || status;
}

function garantirModaisAnuncio() {
    if (document.getElementById("admModalStatusAnuncioOverlay")) return;

    const wrapper = document.createElement("div");
    wrapper.innerHTML = `
        <div class="admin-modal-overlay" id="admModalStatusAnuncioOverlay" hidden>
            <div class="admin-modal">
                <h3>Alterar status</h3>
                <p>Anúncio: <strong id="admModalStatusAnuncioTitulo"></strong></p>

                <div class="admin-form-campo">
                    <label for="admModalStatusAnuncioSelect">Novo status</label>
                    <select id="admModalStatusAnuncioSelect">
                        <option value="ativo">Ativo</option>
                        <option value="oculto">Oculto</option>
                    </select>
                </div>

                <div class="admin-form-campo">
                    <label for="admModalStatusAnuncioMotivo">
                        Motivo <span id="admModalStatusAnuncioMotivoObrig">(obrigatório)</span>
                    </label>
                    <textarea id="admModalStatusAnuncioMotivo" rows="3"
                        placeholder="Explique o motivo — o proprietário poderá ver essa mensagem."></textarea>
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
                <h3>Excluir anúncio</h3>
                <p>Tem certeza que deseja excluir <strong id="admModalExcluirAnuncioTitulo"></strong>?
                   Essa ação não pode ser desfeita.</p>

                <p class="admin-form-erro" id="admModalExcluirAnuncioErro"></p>

                <div class="admin-modal-botoes">
                    <button class="admin-btn-secundario" id="admModalExcluirAnuncioCancelar">Cancelar</button>
                    <button class="admin-btn-perigo" id="admModalExcluirAnuncioConfirmar">Excluir</button>
                </div>
            </div>
        </div>
    `;
    document.body.appendChild(wrapper);

    document.getElementById("admModalStatusAnuncioCancelar").addEventListener("click", fecharModalStatusAnuncio);
    document.getElementById("admModalExcluirAnuncioCancelar").addEventListener("click", fecharModalExcluirAnuncio);
    document.getElementById("admModalStatusAnuncioSelect").addEventListener("change", atualizarObrigatoriedadeMotivoAnuncio);
}

function atualizarObrigatoriedadeMotivoAnuncio() {
    const select = document.getElementById("admModalStatusAnuncioSelect");
    const aviso = document.getElementById("admModalStatusAnuncioMotivoObrig");
    // Só "removido" exige motivo — voltar pra "ativo" não precisa.
    aviso.style.display = select.value === "oculto" ? "inline" : "none";
}

// ================= ALTERAR STATUS =================
function abrirModalStatusAnuncio(anuncio, aoConfirmar) {
    garantirModaisAnuncio();

    _anuncioStatusAtual = anuncio;
    _callbackStatusAnuncio = aoConfirmar;

    document.getElementById("admModalStatusAnuncioTitulo").textContent = anuncio.titulo;
    document.getElementById("admModalStatusAnuncioSelect").value = anuncio.status;
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
    const motivo = document.getElementById("admModalStatusAnuncioMotivo").value.trim();
    const erroEl = document.getElementById("admModalStatusAnuncioErro");
    erroEl.textContent = "";

    if (novoStatus === "oculto" && !motivo) {
        erroEl.textContent = "Informe o motivo da remoção.";
        return;
    }

    const botao = document.getElementById('admModalStatusAnuncioConfirmar');
    botao.disabled = true;
    try { await alterarStatusAnuncioAdmin(_anuncioStatusAtual.id, novoStatus, motivo); }
    catch (err) { erroEl.textContent = err.message; botao.disabled = false; return; }
    window.mostrarToastAdmin(
        `Status de "${_anuncioStatusAtual.titulo}" atualizado para "${labelStatusAnuncio(novoStatus)}"`,
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
    const erroEl = document.getElementById("admModalExcluirAnuncioErro");
    erroEl.textContent = "";

    const botao = document.getElementById("admModalExcluirAnuncioConfirmar");
    botao.disabled = true;
    try { await excluirAnuncioAdmin(anuncio.id, "Arquivado pelo administrador");
    } catch (err) { erroEl.textContent = err.message; botao.disabled = false; return; }

    window.mostrarToastAdmin(`"${anuncio.titulo}" foi excluído`, "sucesso");

    const callback = _callbackExcluirAnuncio;
    fecharModalExcluirAnuncio();
    if (callback) callback();
}