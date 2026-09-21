/**
 * admin-usuario-acoes.js
 * ------------------------------------------------------------------
 * Modal de "alterar status" (ativo/suspenso/banido, com motivo) e
 * modal de "excluir usuário" — usados em Admin-Usuarios,
 * Admin-Usuario-Detalhe e qualquer outra tela do admin que precise
 * dessas duas ações, pra não duplicar essa lógica em cada uma.
 *
 * Uso:
 *   abrirModalStatus(usuario, (novoStatus) => { ...recarregar tela... });
 *   abrirModalExcluir(usuario, () => { ...recarregar/redirecionar... });
 *
 * Depende de:
 *   - admin-api.js (alterarStatusUsuarioAdmin, excluirUsuarioAdmin)
 *   - window.mostrarToastAdmin (definido em admin-frame.js)
 * ------------------------------------------------------------------
 */

let _usuarioStatusAtual = null;
let _callbackStatus = null;
let _usuarioExcluirAtual = null;
let _callbackExcluir = null;

function labelStatusAcoes(status) {
    return { ativo: "Ativo", inativo: "Inativo" }[status] || status;
}

// Cria os dois modais uma única vez e anexa no <body>, caso ainda
// não existam nessa página.
function garantirModaisUsuario() {
    if (document.getElementById("admModalStatusOverlay")) return;

    const wrapper = document.createElement("div");
    wrapper.innerHTML = `
        <div class="admin-modal-overlay" id="admModalStatusOverlay" hidden>
            <div class="admin-modal">
                <h3>Alterar status</h3>
                <p>Usuário: <strong id="admModalStatusNome"></strong></p>

                <div class="admin-form-campo">
                    <label for="admModalStatusSelect">Novo status</label>
                    <select id="admModalStatusSelect">
                        <option value="ativo">Ativo</option>
                        <option value="inativo">Inativo</option>
                    </select>
                </div>


                <p class="admin-form-erro" id="admModalStatusErro"></p>

                <div class="admin-modal-botoes">
                    <button class="admin-btn-secundario" id="admModalStatusCancelar">Cancelar</button>
                    <button class="admin-btn-primario" id="admModalStatusConfirmar">Confirmar</button>
                </div>
            </div>
        </div>

        <div class="admin-modal-overlay" id="admModalExcluirOverlay" hidden>
            <div class="admin-modal">
                <h3>Excluir usuário</h3>
                <p>Tem certeza que deseja excluir <strong id="admModalExcluirNome"></strong>?
                   Essa ação não pode ser desfeita.</p>

                <p class="admin-form-erro" id="admModalExcluirErro"></p>

                <div class="admin-modal-botoes">
                    <button class="admin-btn-secundario" id="admModalExcluirCancelar">Cancelar</button>
                    <button class="admin-btn-perigo" id="admModalExcluirConfirmar">Excluir</button>
                </div>
            </div>
        </div>
    `;
    document.body.appendChild(wrapper);

    document.getElementById("admModalStatusCancelar").addEventListener("click", fecharModalStatus);
    document.getElementById("admModalExcluirCancelar").addEventListener("click", fecharModalExcluir);

}

// ================= ALTERAR STATUS =================
function abrirModalStatus(usuario, aoConfirmar) {
    garantirModaisUsuario();

    _usuarioStatusAtual = usuario;
    _callbackStatus = aoConfirmar;

    document.getElementById("admModalStatusNome").textContent = usuario.nome;
    document.getElementById("admModalStatusSelect").value = usuario.status;
    document.getElementById("admModalStatusErro").textContent = "";

    document.getElementById("admModalStatusOverlay").hidden = false;

    // Substitui o botão por um clone limpo antes de religar o clique,
    // pra não empilhar um listener novo a cada vez que o modal abre.
    const btn = document.getElementById("admModalStatusConfirmar");
    const btnNovo = btn.cloneNode(true);
    btn.replaceWith(btnNovo);
    btnNovo.addEventListener("click", confirmarModalStatus);
}

function fecharModalStatus() {
    document.getElementById("admModalStatusOverlay").hidden = true;
    _usuarioStatusAtual = null;
    _callbackStatus = null;
}

async function confirmarModalStatus() {
    const novoStatus = document.getElementById("admModalStatusSelect").value;
    const motivo = "";
    const erroEl = document.getElementById("admModalStatusErro");
    erroEl.textContent = "";


    const botao = document.getElementById('admModalStatusConfirmar');
    botao.disabled = true;
    try {
        await alterarStatusUsuarioAdmin(_usuarioStatusAtual.id, novoStatus);
    } catch (err) {
        erroEl.textContent = err.message;
        botao.disabled = false;
        return;
    }
    window.mostrarToastAdmin(
        `Status de ${_usuarioStatusAtual.nome} atualizado para "${labelStatusAcoes(novoStatus)}"`,
        "sucesso"
    );

    const callback = _callbackStatus;
    const usuarioAlterado = _usuarioStatusAtual;
    fecharModalStatus();
    if (callback) callback(novoStatus, motivo, usuarioAlterado);
}

// ================= EXCLUIR =================
function abrirModalExcluir(usuario, aoConfirmar) {
    garantirModaisUsuario();

    _usuarioExcluirAtual = usuario;
    _callbackExcluir = aoConfirmar;

    document.getElementById("admModalExcluirNome").textContent = usuario.nome;
    document.getElementById("admModalExcluirErro").textContent = "";
    document.getElementById("admModalExcluirOverlay").hidden = false;

    const btn = document.getElementById("admModalExcluirConfirmar");
    const btnNovo = btn.cloneNode(true);
    btn.replaceWith(btnNovo);
    btnNovo.addEventListener("click", confirmarModalExcluir);
}

function fecharModalExcluir() {
    document.getElementById("admModalExcluirOverlay").hidden = true;
    _usuarioExcluirAtual = null;
    _callbackExcluir = null;
}

async function confirmarModalExcluir() {
    const usuario = _usuarioExcluirAtual;
    const erroEl = document.getElementById("admModalExcluirErro");
    erroEl.textContent = "";

    const botao = document.getElementById('admModalExcluirConfirmar');
    botao.disabled = true;
    try { await excluirUsuarioAdmin(usuario.id); }
    catch (err) { erroEl.textContent = err.message; botao.disabled = false; return; }
    window.mostrarToastAdmin(`${usuario.nome} foi excluído`, "sucesso");

    const callback = _callbackExcluir;
    fecharModalExcluir();
    if (callback) callback();
}