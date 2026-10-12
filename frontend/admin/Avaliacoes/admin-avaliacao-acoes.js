/**
 * admin-avaliacao-acoes.js
 * ------------------------------------------------------------------
 * Modal de "ver detalhes", modal de "ocultar/reexibir avaliação" (reversível)
 * e modal de "excluir avaliação" (permanente) — mesmo padrão de
 * admin-usuario-acoes.js, pra não duplicar essa lógica em cada tela.
 *
 * Uso:
 *   abrirModalVerAvaliacao(avaliacao);
 *   abrirModalOcultarAvaliacao(avaliacao, (novoValorOculta) => { ...recarregar tela... });
 *   abrirModalExcluirAvaliacao(avaliacao, () => { ...recarregar tela... });
 *
 * Depende de:
 *   - admin-api.js (alterarVisibilidadeAvaliacaoAdmin, excluirAvaliacaoAdmin)
 *   - window.mostrarToastAdmin (definido em admin-frame.js; se faltar, o toast é ignorado)
 *
 * Notificação: quem ESCREVEU a avaliação e quem foi AVALIADO por ela são
 * notificados nas duas ações — isso é responsabilidade do back (ver
 * suposições no topo de admin-api.js), não tem nada pra fazer aqui.
 * ------------------------------------------------------------------
 */

let _avaliacaoOcultarAtual = null;
let _callbackOcultar = null;
let _avaliacaoExcluirAtual = null;
let _callbackExcluir = null;

function toastAdmin(mensagem, tipo) {
    if (typeof window.mostrarToastAdmin === "function") window.mostrarToastAdmin(mensagem, tipo);
}

function escaparAvaliacaoAcoes(valor) {
    return String(valor ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

function estrelasHtmlAvaliacaoAcoes(nota) {
    let html = "";
    for (let i = 1; i <= 5; i++) html += `<i class="bi ${i <= nota ? "bi-star-fill" : "bi-star"}"></i>`;
    return html;
}

function formatarDataAvaliacaoAcoes(iso) {
    return iso ? new Date(iso).toLocaleDateString("pt-BR") : "";
}

// Cria os três modais uma única vez e anexa no <body>, caso ainda não
// existam nessa página.
function garantirModaisAvaliacao() {
    if (document.getElementById("admModalVerAvaliacaoOverlay")) return;

    const wrapper = document.createElement("div");
    wrapper.innerHTML = `
        <div class="admin-modal-overlay" id="admModalVerAvaliacaoOverlay" hidden>
            <div class="admin-modal">
                <h3>Detalhes da avaliação</h3>
                <p>Avaliador: <strong id="admModalVerAvaliador"></strong></p>
                <p>Avaliado: <strong id="admModalVerAvaliado"></strong></p>
                <p>Item: <strong id="admModalVerItem"></strong></p>
                <p>Nota: <span id="admModalVerEstrelas"></span></p>
                <p>Comentário:</p>
                <p id="admModalVerComentario"></p>
                <p>Data: <strong id="admModalVerData"></strong></p>

                <div class="admin-modal-botoes">
                    <button class="admin-btn-secundario" id="admModalVerFechar">Fechar</button>
                </div>
            </div>
        </div>

        <div class="admin-modal-overlay" id="admModalOcultarOverlay" hidden>
            <div class="admin-modal">
                <h3 id="admModalOcultarTitulo">Ocultar avaliação</h3>
                <p id="admModalOcultarTexto"></p>

                <div class="admin-form-campo" id="admModalOcultarMotivoCampo">
                    <label for="admModalOcultarMotivo">Motivo (a pessoa que avaliou será avisada)</label>
                    <textarea id="admModalOcultarMotivo" maxlength="500" rows="3" style="width:100%;resize:vertical;font-family:inherit"></textarea>
                </div>

                <p class="admin-form-erro" id="admModalOcultarErro"></p>

                <div class="admin-modal-botoes">
                    <button class="admin-btn-secundario" id="admModalOcultarCancelar">Cancelar</button>
                    <button class="admin-btn-primario" id="admModalOcultarConfirmar">Ocultar</button>
                </div>
            </div>
        </div>

        <div class="admin-modal-overlay" id="admModalExcluirAvaliacaoOverlay" hidden>
            <div class="admin-modal">
                <h3>Excluir avaliação</h3>
                <p>Essa ação não pode ser desfeita. Quem escreveu a avaliação e quem foi avaliado por ela serão notificados.</p>

                <div class="admin-form-campo">
                    <label for="admModalExcluirAvaliacaoMotivo">Motivo da exclusão (quem avaliou vai ver este texto)</label>
                    <textarea id="admModalExcluirAvaliacaoMotivo" maxlength="500" rows="3" style="width:100%;resize:vertical;font-family:inherit"></textarea>
                </div>

                <p class="admin-form-erro" id="admModalExcluirAvaliacaoErro"></p>

                <div class="admin-modal-botoes">
                    <button class="admin-btn-secundario" id="admModalExcluirAvaliacaoCancelar">Cancelar</button>
                    <button class="admin-btn-perigo" id="admModalExcluirAvaliacaoConfirmar">Excluir</button>
                </div>
            </div>
        </div>
    `;
    document.body.appendChild(wrapper);

    document.getElementById("admModalVerFechar").addEventListener("click", fecharModalVerAvaliacao);
    document.getElementById("admModalOcultarCancelar").addEventListener("click", fecharModalOcultarAvaliacao);
    document.getElementById("admModalExcluirAvaliacaoCancelar").addEventListener("click", fecharModalExcluirAvaliacao);
}

// ================= VER DETALHES =================
function abrirModalVerAvaliacao(avaliacao) {
    garantirModaisAvaliacao();
    document.getElementById("admModalVerAvaliador").textContent = avaliacao.avaliadorNome;
    document.getElementById("admModalVerAvaliado").textContent = avaliacao.avaliadoNome;
    document.getElementById("admModalVerItem").textContent = avaliacao.produtoTitulo;
    document.getElementById("admModalVerEstrelas").innerHTML = estrelasHtmlAvaliacaoAcoes(avaliacao.nota);
    document.getElementById("admModalVerComentario").textContent = avaliacao.comentario || "(sem comentário)";
    document.getElementById("admModalVerData").textContent = formatarDataAvaliacaoAcoes(avaliacao.data);
    document.getElementById("admModalVerAvaliacaoOverlay").hidden = false;
}

function fecharModalVerAvaliacao() {
    document.getElementById("admModalVerAvaliacaoOverlay").hidden = true;
}

// ================= OCULTAR / REEXIBIR (reversível) =================
function abrirModalOcultarAvaliacao(avaliacao, aoConfirmar) {
    garantirModaisAvaliacao();

    _avaliacaoOcultarAtual = avaliacao;
    _callbackOcultar = aoConfirmar;
    const vaiOcultar = !avaliacao.oculta;

    document.getElementById("admModalOcultarTitulo").textContent = vaiOcultar ? "Ocultar avaliação?" : "Reexibir avaliação?";
    document.getElementById("admModalOcultarTexto").textContent = vaiOcultar
        ? "A avaliação deixa de aparecer publicamente e de contar nas estatísticas da plataforma. Quem escreveu e quem foi avaliado são avisados. Dá pra reverter depois."
        : "A avaliação volta a aparecer publicamente e a contar nas estatísticas da plataforma.";
    document.getElementById("admModalOcultarMotivoCampo").hidden = !vaiOcultar;
    document.getElementById("admModalOcultarMotivo").value = "";
    document.getElementById("admModalOcultarErro").textContent = "";
    document.getElementById("admModalOcultarConfirmar").textContent = vaiOcultar ? "Ocultar" : "Reexibir";
    document.getElementById("admModalOcultarOverlay").hidden = false;

    // Substitui o botão por um clone limpo antes de religar o clique, pra
    // não empilhar um listener novo a cada vez que o modal abre (mesmo
    // truque de admin-usuario-acoes.js).
    const btn = document.getElementById("admModalOcultarConfirmar");
    const btnNovo = btn.cloneNode(true);
    btnNovo.disabled = false;
    btn.replaceWith(btnNovo);
    btnNovo.addEventListener("click", confirmarModalOcultar);
}

function fecharModalOcultarAvaliacao() {
    document.getElementById("admModalOcultarOverlay").hidden = true;
    _avaliacaoOcultarAtual = null;
    _callbackOcultar = null;
}

async function confirmarModalOcultar() {
    const avaliacao = _avaliacaoOcultarAtual;
    const vaiOcultar = !avaliacao.oculta;
    const erroEl = document.getElementById("admModalOcultarErro");
    erroEl.textContent = "";
    const motivo = document.getElementById("admModalOcultarMotivo").value.trim();

    const botao = document.getElementById("admModalOcultarConfirmar");
    botao.disabled = true;
    try {
        await alterarVisibilidadeAvaliacaoAdmin(avaliacao.id, vaiOcultar, motivo);
    } catch (err) {
        erroEl.textContent = err.message;
        botao.disabled = false;
        return;
    }
    toastAdmin(vaiOcultar ? "Avaliação ocultada" : "Avaliação reexibida", "sucesso");

    const callback = _callbackOcultar;
    fecharModalOcultarAvaliacao();
    if (callback) callback(vaiOcultar);
}

// ================= EXCLUIR (permanente) =================
function abrirModalExcluirAvaliacao(avaliacao, aoConfirmar) {
    garantirModaisAvaliacao();

    _avaliacaoExcluirAtual = avaliacao;
    _callbackExcluir = aoConfirmar;

    document.getElementById("admModalExcluirAvaliacaoMotivo").value = "";
    document.getElementById("admModalExcluirAvaliacaoErro").textContent = "";
    document.getElementById("admModalExcluirAvaliacaoOverlay").hidden = false;

    const btn = document.getElementById("admModalExcluirAvaliacaoConfirmar");
    const btnNovo = btn.cloneNode(true);
    btnNovo.disabled = false;
    btn.replaceWith(btnNovo);
    btnNovo.addEventListener("click", confirmarModalExcluirAvaliacao);
}

function fecharModalExcluirAvaliacao() {
    document.getElementById("admModalExcluirAvaliacaoOverlay").hidden = true;
    _avaliacaoExcluirAtual = null;
    _callbackExcluir = null;
}

async function confirmarModalExcluirAvaliacao() {
    const avaliacao = _avaliacaoExcluirAtual;
    const erroEl = document.getElementById("admModalExcluirAvaliacaoErro");
    erroEl.textContent = "";
    const motivo = document.getElementById("admModalExcluirAvaliacaoMotivo").value.trim();
    if (motivo.length < 5) {
        erroEl.textContent = "Informe o motivo da exclusão (mín. 5 caracteres). A pessoa que avaliou verá esse texto.";
        return;
    }

    const botao = document.getElementById("admModalExcluirAvaliacaoConfirmar");
    botao.disabled = true;
    try {
        await excluirAvaliacaoAdmin(avaliacao.id, motivo);
    } catch (err) {
        erroEl.textContent = err.message;
        botao.disabled = false;
        return;
    }
    toastAdmin("Avaliação excluída", "sucesso");

    const callback = _callbackExcluir;
    fecharModalExcluirAvaliacao();
    if (callback) callback();
}