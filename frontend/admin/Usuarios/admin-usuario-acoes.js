/**
 * admin-usuario-acoes.js
 * ------------------------------------------------------------------
 * Modal de "alterar status" (ativo/inativo) e
 * modal de "excluir usuário" — usados em Admin-Usuarios,
 * Admin-Usuario-Detalhe e qualquer outra tela do admin que precise
 * dessas duas ações, pra não duplicar essa lógica em cada uma.
 *
 * Uso:
 *   abrirModalStatus(usuario, (novoStatus, usuarioAlterado) => { ...recarregar tela... });
 *   abrirModalExcluir(usuario, () => { ...recarregar/redirecionar... });
 *
 * Depende de:
 *   - admin-api.js (alterarStatusUsuarioAdmin, excluirUsuarioAdmin)
 *   - window.mostrarToastAdmin (definido em admin-frame.js; se faltar, o toast é ignorado)
 * ------------------------------------------------------------------
 */

let _usuarioStatusAtual = null;
let _callbackStatus = null;
let _usuarioExcluirAtual = null;
let _callbackExcluir = null;

function toastAdmin(mensagem, tipo) {
    if (typeof window.mostrarToastAdmin === "function") window.mostrarToastAdmin(mensagem, tipo);
}

// Regra de negócio: só dá pra desativar/excluir um usuário sem locação em
// andamento nem solicitação pendente. Quem garante isso é o back (409); aqui é
// só um aviso antecipado quando o detalhe do usuário já traz os sinais
// `em_locacao` / `tem_solicitacao_pendente` (na lista eles não vêm, e o 409 cobre).
const MSG_BLOQUEIO_USUARIO = "Este usuário tem locação em andamento ou solicitação pendente. Só é possível continuar depois que forem concluídas ou canceladas.";

function usuarioTemBloqueio(usuario) {
    return !!(usuario && (usuario.em_locacao || usuario.tem_solicitacao_pendente));
}

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

                <div class="admin-form-campo" id="admModalStatusMotivoCampo" hidden>
                    <label for="admModalStatusMotivo">Motivo da suspensão (o usuário vai ver este texto)</label>
                    <textarea id="admModalStatusMotivo" maxlength="500" rows="3" style="width:100%;resize:vertical;font-family:inherit"></textarea>
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
                   Essa ação não pode ser desfeita. O usuário receberá um e-mail
                   avisando que a conta foi excluída.</p>

                <p class="admin-form-erro" id="admModalExcluirErro"></p>

                <div class="admin-modal-botoes">
                    <button class="admin-btn-secundario" id="admModalExcluirCancelar">Cancelar</button>
                    <button class="admin-btn-perigo" id="admModalExcluirConfirmar">Excluir</button>
                </div>
            </div>
        </div>
    `;
    document.body.appendChild(wrapper);

    document.getElementById("admModalStatusSelect").addEventListener("change", atualizarBloqueioStatus);
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
    document.getElementById("admModalStatusMotivo").value = "";

    document.getElementById("admModalStatusOverlay").hidden = false;

    // Substitui o botão por um clone limpo antes de religar o clique,
    // pra não empilhar um listener novo a cada vez que o modal abre.
    const btn = document.getElementById("admModalStatusConfirmar");
    const btnNovo = btn.cloneNode(true);
    btnNovo.disabled = false; // o clone herda "disabled" de um envio anterior bem-sucedido
    btn.replaceWith(btnNovo);
    btnNovo.addEventListener("click", confirmarModalStatus);
    atualizarBloqueioStatus();
}

// Desativar (ativo -> inativo) é bloqueado com locação em andamento/pendente;
// reativar continua liberado.
function atualizarBloqueioStatus() {
    if (!_usuarioStatusAtual) return;
    const desativando = document.getElementById("admModalStatusSelect").value === "inativo"
        && _usuarioStatusAtual.status !== "inativo";
    // O campo de motivo só aparece ao suspender.
    document.getElementById("admModalStatusMotivoCampo").hidden = !desativando;
    const bloqueado = desativando && usuarioTemBloqueio(_usuarioStatusAtual);
    document.getElementById("admModalStatusErro").textContent = bloqueado ? MSG_BLOQUEIO_USUARIO : "";
    document.getElementById("admModalStatusConfirmar").disabled = bloqueado;
}

function fecharModalStatus() {
    document.getElementById("admModalStatusOverlay").hidden = true;
    _usuarioStatusAtual = null;
    _callbackStatus = null;
}

async function confirmarModalStatus() {
    const novoStatus = document.getElementById("admModalStatusSelect").value;
    const erroEl = document.getElementById("admModalStatusErro");
    erroEl.textContent = "";

    const suspendendo = novoStatus === "inativo" && _usuarioStatusAtual.status !== "inativo";
    const motivo = document.getElementById("admModalStatusMotivo").value.trim();
    if (suspendendo && motivo.length < 5) {
        erroEl.textContent = "Informe o motivo da suspensão (mín. 5 caracteres). O usuário verá esse texto.";
        return;
    }

    const botao = document.getElementById('admModalStatusConfirmar');
    botao.disabled = true;
    try {
        await alterarStatusUsuarioAdmin(_usuarioStatusAtual.id, novoStatus, suspendendo ? motivo : "");
    } catch (err) {
        erroEl.textContent = err.message;
        botao.disabled = false;
        return;
    }
    toastAdmin(
        `Status de ${_usuarioStatusAtual.nome} atualizado para "${labelStatusAcoes(novoStatus)}"`,
        "sucesso"
    );

    const callback = _callbackStatus;
    const usuarioAlterado = _usuarioStatusAtual;
    fecharModalStatus();
    if (callback) callback(novoStatus, usuarioAlterado);
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
    btnNovo.disabled = false; // o clone herda "disabled" de uma exclusão anterior
    btn.replaceWith(btnNovo);
    btnNovo.addEventListener("click", confirmarModalExcluir);

    if (usuarioTemBloqueio(usuario)) {
        document.getElementById("admModalExcluirErro").textContent = MSG_BLOQUEIO_USUARIO;
        btnNovo.disabled = true;
    }
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
    toastAdmin(`${usuario.nome} foi excluído`, "sucesso");

    const callback = _callbackExcluir;
    fecharModalExcluir();
    if (callback) callback();
}