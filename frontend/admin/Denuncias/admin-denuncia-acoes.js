/**
 * admin-denuncia-acoes.js
 * ------------------------------------------------------------------
 * Modal de "ver detalhes / responder" (com aviso de reincidência do
 * denunciado e atalho pra reativar conta suspensa), modal de "marcar como
 * improcedente" e confirmação rápida de mudança de status — mesmo padrão
 * de admin-usuario-acoes.js e admin-avaliacao-acoes.js.
 *
 * Uso:
 *   abrirModalOcorrencia(ocorrencia, () => { ...recarregar tabela... });
 *   confirmarMudancaStatusRapida(ocorrencia, 'resolvida', () => { ...recarregar... });
 *   abrirModalImprocedente(ocorrencia, () => { ...recarregar... });
 *
 * Depende de:
 *   - denuncias-api.js (alterarStatusOcorrenciaAdmin, responderOcorrenciaAdmin)
 *   - admin-api.js / usuarios (buscarUsuarioAdminPorId) — pra reincidência
 *   - admin-usuario-acoes.js (abrirModalStatus) — reativação de conta,
 *     SEM duplicar esse fluxo aqui
 *   - window.mostrarToastAdmin (definido em admin-frame.js; se faltar, o toast é ignorado)
 * ------------------------------------------------------------------
 */

let _ocorrenciaAtual = null;
let _callbackOcorrencia = null;
let _ocorrenciaImprocedenteAtual = null;
let _callbackImprocedente = null;

function toastAdmin(mensagem, tipo) {
    if (typeof window.mostrarToastAdmin === "function") window.mostrarToastAdmin(mensagem, tipo);
}

function escaparOcorrenciaAcoes(valor) {
    return String(valor ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

function formatarDataOcorrenciaAcoes(iso) {
    return iso ? new Date(iso).toLocaleString("pt-BR") : "—";
}

// Link pro perfil, mesmo padrão de celulaUsuarioPagamento (pagamentos.js).
function linkUsuarioOcorrencia(id, nome) {
    const nomeEsc = escaparOcorrenciaAcoes(nome || "—");
    return id
        ? `<a href="/admin/usuarios/detalhe?id=${encodeURIComponent(id)}" class="admin-usuario-link">${nomeEsc}</a>`
        : nomeEsc;
}

const ROTULOS_STATUS_OCORRENCIA = { aberta: "Aberta", andamento: "Em Progresso", resolvida: "Resolvida", fechada: "Fechada" };
const ROTULOS_ORIGEM_OCORRENCIA = { anuncio: "Anúncio", avaliacao: "Avaliação", aluguel: "Aluguel", conversa: "Conversa" };

// Cria os modais uma única vez e anexa no <body>, caso ainda não existam.
function garantirModaisOcorrencia() {
    if (document.getElementById("admModalOcorrenciaOverlay")) return;

    const wrapper = document.createElement("div");
    wrapper.innerHTML = `
        <div class="admin-modal-overlay" id="admModalOcorrenciaOverlay" hidden>
            <div class="admin-modal admin-modal-largo">
                <div class="admin-modal-topo-badges">
                    <span class="admin-badge" id="admOcorTipoBadge"></span>
                    <span class="admin-badge" id="admOcorStatusBadge"></span>
                </div>
                <h3 id="admOcorTitulo"></h3>
                <p class="admin-protocolo" id="admOcorProtocolo"></p>

                <p class="admin-reincidencia-aviso" id="admOcorReincidencia" hidden></p>

                <div class="admin-detalhes-grid" id="admOcorInfoGrid"></div>

                <div id="admOcorAnexoLinha" class="admin-form-campo" hidden>
                    <span>Evidência anexada</span>
                    <a id="admOcorAnexoLink" href="#" target="_blank" rel="noopener" class="admin-anexo-link"><i class="bi bi-paperclip"></i> Ver anexo</a>
                </div>

                <div class="admin-form-campo">
                    <span>Descrição</span>
                    <p id="admOcorDescricao" class="admin-descricao-texto"></p>
                </div>

                <div class="admin-form-campo" id="admOcorRespostasCampo" hidden>
                    <span>Respostas anteriores</span>
                    <div id="admOcorRespostasLista" class="admin-respostas-lista"></div>
                </div>

                <div class="admin-form-campo">
                    <span>Alterar status</span>
                    <div class="admin-status-botoes" id="admOcorStatusBotoes"></div>
                </div>

                <div class="admin-form-campo" id="admOcorReativarCampo" hidden>
                    <button class="admin-btn-secundario" id="admOcorReativarBtn"><i class="bi bi-unlock"></i> Reativar conta do denunciado</button>
                </div>

                <div class="admin-form-campo">
                    <label for="admOcorResposta">Responder</label>
                    <textarea id="admOcorResposta" maxlength="1000" rows="3" style="width:100%;resize:vertical;font-family:inherit" placeholder="Escreva uma resposta para o usuário..."></textarea>
                </div>

                <p class="admin-form-erro" id="admOcorErro"></p>

                <div class="admin-modal-botoes">
                    <button class="admin-btn-secundario" id="admOcorFechar">Fechar</button>
                    <button class="admin-btn-primario" id="admOcorEnviarResposta"><i class="bi bi-send"></i> Enviar resposta</button>
                </div>
            </div>
        </div>

        <div class="admin-modal-overlay" id="admModalImprocedenteOverlay" hidden>
            <div class="admin-modal">
                <h3>Marcar denúncia como improcedente</h3>
                <p>A denúncia é encerrada como infundada. O denunciante pode ver o motivo abaixo — considere, se for o caso, dar uma advertência a ele pelo perfil dele.</p>

                <div class="admin-form-campo">
                    <label for="admImprocedenteMotivo">Motivo (o denunciante vai ver este texto)</label>
                    <textarea id="admImprocedenteMotivo" maxlength="500" rows="3" style="width:100%;resize:vertical;font-family:inherit"></textarea>
                </div>

                <p class="admin-form-erro" id="admImprocedenteErro"></p>

                <div class="admin-modal-botoes">
                    <button class="admin-btn-secundario" id="admImprocedenteCancelar">Cancelar</button>
                    <button class="admin-btn-perigo" id="admImprocedenteConfirmar">Marcar improcedente</button>
                </div>
            </div>
        </div>

        <div class="admin-modal-overlay" id="admModalConfirmRapidoOverlay" hidden>
            <div class="admin-modal">
                <h3 id="admConfirmRapidoTitulo">Confirmar</h3>
                <p id="admConfirmRapidoTexto"></p>
                <p class="admin-form-erro" id="admConfirmRapidoErro"></p>
                <div class="admin-modal-botoes">
                    <button class="admin-btn-secundario" id="admConfirmRapidoCancelar">Cancelar</button>
                    <button class="admin-btn-primario" id="admConfirmRapidoConfirmar">Confirmar</button>
                </div>
            </div>
        </div>
    `;
    document.body.appendChild(wrapper);

    document.getElementById("admOcorFechar").addEventListener("click", fecharModalOcorrencia);
    document.getElementById("admImprocedenteCancelar").addEventListener("click", fecharModalImprocedente);
}

// ================= VER / RESPONDER =================
async function abrirModalOcorrencia(ocorrencia, aoAtualizar) {
    garantirModaisOcorrencia();

    _ocorrenciaAtual = ocorrencia;
    _callbackOcorrencia = aoAtualizar;

    document.getElementById("admOcorTipoBadge").textContent = ocorrencia.tipo === "suporte" ? "Suporte" : "Denúncia";
    document.getElementById("admOcorTipoBadge").className = `admin-badge tipo-${ocorrencia.tipo}`;
    document.getElementById("admOcorStatusBadge").textContent = ROTULOS_STATUS_OCORRENCIA[ocorrencia.status] || ocorrencia.status;
    document.getElementById("admOcorStatusBadge").className = `admin-badge status-${ocorrencia.status}`;

    document.getElementById("admOcorTitulo").textContent = `#${ocorrencia.id} — ${ocorrencia.motivo}`;
    document.getElementById("admOcorProtocolo").textContent = ocorrencia.protocolo ? `Protocolo: #${ocorrencia.protocolo}` : "";

    const infos = [
        `<div><span>Denunciante</span><strong>${linkUsuarioOcorrencia(ocorrencia.denuncianteId, ocorrencia.denuncianteNome)}</strong></div>`
    ];
    if (ocorrencia.denunciadoNome) {
        infos.push(`<div><span>Denunciado</span><strong>${linkUsuarioOcorrencia(ocorrencia.denunciadoId, ocorrencia.denunciadoNome)}</strong></div>`);
    }
    infos.push(`<div><span>Prioridade</span><strong>${escaparOcorrenciaAcoes(ocorrencia.prioridade)}</strong></div>`);
    infos.push(`<div><span>Data</span><strong>${formatarDataOcorrenciaAcoes(ocorrencia.criadoEm)}</strong></div>`);
    if (ocorrencia.origem) {
        infos.push(`<div><span>Origem</span><strong>${ROTULOS_ORIGEM_OCORRENCIA[ocorrencia.origem.tipo] || ocorrencia.origem.tipo} #${escaparOcorrenciaAcoes(ocorrencia.origem.id)}</strong></div>`);
    }
    document.getElementById("admOcorInfoGrid").innerHTML = infos.join("");

    const anexoLinha = document.getElementById("admOcorAnexoLinha");
    if (ocorrencia.anexo?.url) {
        anexoLinha.hidden = false;
        document.getElementById("admOcorAnexoLink").href = ocorrencia.anexo.url;
    } else {
        anexoLinha.hidden = true;
    }

    document.getElementById("admOcorDescricao").textContent = ocorrencia.descricao || "(sem descrição)";

    const respostasCampo = document.getElementById("admOcorRespostasCampo");
    if (ocorrencia.respostas.length) {
        respostasCampo.hidden = false;
        document.getElementById("admOcorRespostasLista").innerHTML = ocorrencia.respostas.map(r => `
            <p><strong>${escaparOcorrenciaAcoes(r.autor)}</strong> (${formatarDataOcorrenciaAcoes(r.criado_em)}): ${escaparOcorrenciaAcoes(r.mensagem)}</p>
        `).join("");
    } else {
        respostasCampo.hidden = true;
    }

    // Botões de status: todos exceto o atual e exceto 'improcedente' (que
    // tem modal próprio, com motivo obrigatório).
    const statusBotoes = document.getElementById("admOcorStatusBotoes");
    statusBotoes.innerHTML = "";
    Object.entries(ROTULOS_STATUS_OCORRENCIA).forEach(([valor, rotulo]) => {
        if (valor === ocorrencia.status) return;
        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = `admin-status-pill status-${valor}`;
        btn.textContent = rotulo;
        btn.addEventListener("click", () => mudarStatusNoModal(valor));
        statusBotoes.appendChild(btn);
    });

    document.getElementById("admOcorResposta").value = "";
    document.getElementById("admOcorErro").textContent = "";

    // Reincidência + atalho de reativação: só busca o usuário denunciado se
    // houver um (não existe em tickets de Suporte). Feito à parte pra não
    // atrasar a abertura do modal — aparece assim que a busca voltar.
    const reincidenciaEl = document.getElementById("admOcorReincidencia");
    const reativarCampo = document.getElementById("admOcorReativarCampo");
    reincidenciaEl.hidden = true;
    reativarCampo.hidden = true;

    if (ocorrencia.denunciadoId) {
        buscarUsuarioAdminPorId(ocorrencia.denunciadoId).then(usuarioBruto => {
            if (_ocorrenciaAtual !== ocorrencia) return; // modal já mudou de ocorrência
            const usuario = { ...usuarioBruto, status: usuarioBruto.ativo ? "ativo" : "inativo" };
            const qtd = Number(usuario.estatisticas?.denuncias_recebidas) || 0;

            if (qtd > 1) {
                reincidenciaEl.hidden = false;
                reincidenciaEl.innerHTML = `<i class="bi bi-exclamation-triangle-fill"></i> ${linkUsuarioOcorrencia(usuario.id, usuario.nome)} já recebeu <strong>${qtd} denúncias</strong> no total.`;
            }

            if (usuario.status === "inativo") {
                reativarCampo.hidden = false;
                document.getElementById("admOcorReativarBtn").onclick = () => {
                    abrirModalStatus(usuario, () => { if (_callbackOcorrencia) _callbackOcorrencia(); });
                };
            }
        }).catch(() => { /* não bloqueia o resto do modal se essa busca falhar */ });
    }

    document.getElementById("admModalOcorrenciaOverlay").hidden = false;

    const btnEnviar = document.getElementById("admOcorEnviarResposta");
    const btnNovo = btnEnviar.cloneNode(true);
    btnNovo.disabled = false;
    btnEnviar.replaceWith(btnNovo);
    btnNovo.addEventListener("click", enviarRespostaModal);
}

function fecharModalOcorrencia() {
    document.getElementById("admModalOcorrenciaOverlay").hidden = true;
    _ocorrenciaAtual = null;
    _callbackOcorrencia = null;
}

async function mudarStatusNoModal(novoStatus) {
    const erroEl = document.getElementById("admOcorErro");
    erroEl.textContent = "";
    try {
        await alterarStatusOcorrenciaAdmin(_ocorrenciaAtual.id, novoStatus);
    } catch (err) {
        erroEl.textContent = err.message;
        return;
    }
    toastAdmin(`Status atualizado para "${ROTULOS_STATUS_OCORRENCIA[novoStatus] || novoStatus}"`, "sucesso");
    _ocorrenciaAtual.status = novoStatus;
    const callback = _callbackOcorrencia;
    fecharModalOcorrencia();
    if (callback) callback();
}

async function enviarRespostaModal() {
    const mensagem = document.getElementById("admOcorResposta").value.trim();
    const erroEl = document.getElementById("admOcorErro");
    erroEl.textContent = "";
    if (!mensagem) {
        erroEl.textContent = "Escreva uma resposta antes de enviar.";
        return;
    }

    const botao = document.getElementById("admOcorEnviarResposta");
    botao.disabled = true;
    try {
        await responderOcorrenciaAdmin(_ocorrenciaAtual.id, mensagem);
    } catch (err) {
        erroEl.textContent = err.message;
        botao.disabled = false;
        return;
    }
    toastAdmin("Resposta enviada ao usuário", "sucesso");
    _ocorrenciaAtual.respostas.push({ autor: "Você", mensagem, criado_em: new Date().toISOString() });
    const callback = _callbackOcorrencia;
    const ocorrenciaAtualizada = _ocorrenciaAtual;
    fecharModalOcorrencia();
    if (callback) callback();
    // Reabre já atualizado, caso o admin queira seguir olhando/alterando status.
    abrirModalOcorrencia(ocorrenciaAtualizada, callback);
}

// ================= IMPROCEDENTE =================
function abrirModalImprocedente(ocorrencia, aoConfirmar) {
    garantirModaisOcorrencia();

    _ocorrenciaImprocedenteAtual = ocorrencia;
    _callbackImprocedente = aoConfirmar;

    document.getElementById("admImprocedenteMotivo").value = "";
    document.getElementById("admImprocedenteErro").textContent = "";
    document.getElementById("admModalImprocedenteOverlay").hidden = false;

    const btn = document.getElementById("admImprocedenteConfirmar");
    const btnNovo = btn.cloneNode(true);
    btnNovo.disabled = false;
    btn.replaceWith(btnNovo);
    btnNovo.addEventListener("click", confirmarModalImprocedente);
}

function fecharModalImprocedente() {
    document.getElementById("admModalImprocedenteOverlay").hidden = true;
    _ocorrenciaImprocedenteAtual = null;
    _callbackImprocedente = null;
}

async function confirmarModalImprocedente() {
    const erroEl = document.getElementById("admImprocedenteErro");
    erroEl.textContent = "";
    const motivo = document.getElementById("admImprocedenteMotivo").value.trim();
    if (motivo.length < 5) {
        erroEl.textContent = "Informe o motivo (mín. 5 caracteres). O denunciante verá esse texto.";
        return;
    }

    const botao = document.getElementById("admImprocedenteConfirmar");
    botao.disabled = true;
    try {
        await alterarStatusOcorrenciaAdmin(_ocorrenciaImprocedenteAtual.id, "improcedente", motivo);
    } catch (err) {
        erroEl.textContent = err.message;
        botao.disabled = false;
        return;
    }
    toastAdmin("Denúncia marcada como improcedente", "sucesso");

    const callback = _callbackImprocedente;
    fecharModalImprocedente();
    if (callback) callback();
}

// ================= CONFIRMAÇÃO RÁPIDA (resolver sem ter respondido) =================
// Usado pelo botão de "resolver" direto na tabela: se a ocorrência ainda
// não teve nenhuma resposta enviada ao usuário, confirma antes — evita
// fechar um caso sem o usuário saber o desfecho.
function confirmarMudancaStatusRapida(ocorrencia, novoStatus, aoConfirmar) {
    if (ocorrencia.respostas.length > 0) {
        aplicarMudancaStatusRapida(ocorrencia, novoStatus, aoConfirmar);
        return;
    }

    garantirModaisOcorrencia();
    document.getElementById("admConfirmRapidoTitulo").textContent = "Resolver sem responder?";
    document.getElementById("admConfirmRapidoTexto").textContent =
        "Nenhuma resposta foi enviada ao usuário ainda. Marcar como resolvida agora mesmo assim?";
    document.getElementById("admConfirmRapidoErro").textContent = "";
    document.getElementById("admModalConfirmRapidoOverlay").hidden = false;

    const cancelar = document.getElementById("admConfirmRapidoCancelar");
    const cancelarNovo = cancelar.cloneNode(true);
    cancelar.replaceWith(cancelarNovo);
    cancelarNovo.addEventListener("click", () => { document.getElementById("admModalConfirmRapidoOverlay").hidden = true; });

    const confirmar = document.getElementById("admConfirmRapidoConfirmar");
    const confirmarNovo = confirmar.cloneNode(true);
    confirmarNovo.disabled = false;
    confirmar.replaceWith(confirmarNovo);
    confirmarNovo.addEventListener("click", async () => {
        confirmarNovo.disabled = true;
        try {
            await aplicarMudancaStatusRapida(ocorrencia, novoStatus, aoConfirmar);
            document.getElementById("admModalConfirmRapidoOverlay").hidden = true;
        } catch (err) {
            document.getElementById("admConfirmRapidoErro").textContent = err.message;
            confirmarNovo.disabled = false;
        }
    });
}

async function aplicarMudancaStatusRapida(ocorrencia, novoStatus, aoConfirmar) {
    await alterarStatusOcorrenciaAdmin(ocorrencia.id, novoStatus);
    toastAdmin(`Status atualizado para "${ROTULOS_STATUS_OCORRENCIA[novoStatus] || novoStatus}"`, "sucesso");
    if (aoConfirmar) aoConfirmar();
}