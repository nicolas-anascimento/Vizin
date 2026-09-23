/**
 * admin-anuncio-acoes.js
 * ------------------------------------------------------------------
 * Três modais de moderação de anúncio:
 *
 *   - "Ver anúncio": mostra todos os dados do anúncio (fotos, descrição,
 *     localização, proprietário, categoria, preço, disponibilidade) pro
 *     admin analisar antes de decidir alterar status ou excluir.
 *   - "Alterar status": alterna Ativo <-> Removido — reversível, motivo
 *     obrigatório ao remover.
 *   - "Excluir anúncio": remoção definitiva — motivo sempre obrigatório.
 *     Se o anúncio já teve locações no histórico, o back recusa (409) e
 *     este modal se transforma numa oferta de "arquivar em vez de
 *     excluir" (ver confirmarModalExcluirAnuncio).
 *
 * Ciclo de vida do anúncio: ATIVO, REMOVIDO e ARQUIVADO. Não existe etapa
 * de aprovação/moderação. "Arquivado" não aparece como opção manual no
 * select de "Alterar status" — só é atingido automaticamente quando o
 * back recusa excluir um anúncio com histórico de locação. Alterar
 * status pra "removido" faz o back notificar o dono com o motivo
 * informado (ver notificacoes-shared.js, tipo "anuncio_removido_admin"
 * -> leva o dono pra /meus-objetos). Arquivar não notifica o dono.
 *
 * Uso:
 *   abrirModalVerAnuncio(anuncio);
 *   abrirModalStatusAnuncio(anuncio, (novoStatus) => { ...recarregar... });
 *   abrirModalExcluirAnuncio(anuncio, () => { ...recarregar/redirecionar... });
 *
 * Depende de:
 *   - admin-api.js desta pasta (alterarStatusAnuncioAdmin, excluirAnuncioAdmin)
 *   - window.mostrarToastAdmin (definido em admin-frame.js)
 *
 * TODO: o modal "Ver anúncio" assume que os campos completos (descrição,
 * localização, todas as fotos em `fotos_item`) já vêm na própria linha
 * devolvida por GET /admin/objetos — é o que anuncios.js espalha (`...a`)
 * pra dentro de cada item de `estado.anuncios`. Se a listagem do back for
 * enxuta (sem esses campos), este modal precisa passar a buscar
 * GET /admin/objetos/:id à parte antes de abrir — confirmar com o back-end.
 * ------------------------------------------------------------------
 */

const escAdminAcoes = valor => String(valor ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"})[c]);

let _anuncioStatusAtual = null;
let _callbackStatusAnuncio = null;
let _anuncioExcluirAtual = null;
let _callbackExcluirAnuncio = null;

function labelStatusAnuncio(status) {
    return { ativo: "Ativo", removido: "Removido", arquivado: "Arquivado" }[status] || status;
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
                <h3>Alterar status</h3>
                <p>Anúncio: <strong id="admModalStatusAnuncioTitulo"></strong></p>

                <div class="admin-form-campo">
                    <label for="admModalStatusAnuncioSelect">Novo status</label>
                    <select id="admModalStatusAnuncioSelect">
                        <option value="ativo">Ativo</option>
                        <option value="removido">Removido</option>
                        <!-- "Arquivado" normalmente só é atingido via oferta automática no
                             modal de excluir (histórico de locação) — aparece aqui só pra
                             exibir corretamente o status atual quando já está arquivado,
                             e pra permitir reverter manualmente se precisar. -->
                        <option value="arquivado">Arquivado</option>
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

                <div class="admin-form-campo" id="admModalExcluirAnuncioMotivoCampo">
                    <label for="admModalExcluirAnuncioMotivo">
                        Motivo <span>(obrigatório)</span>
                    </label>
                    <textarea id="admModalExcluirAnuncioMotivo" rows="3"
                        placeholder="Explique o motivo — o proprietário poderá ver essa mensagem."></textarea>
                </div>

                <p class="admin-form-erro" id="admModalExcluirAnuncioErro"></p>

                <!-- Some por padrão; aparece só quando o back recusa a exclusão por causa
                     de histórico de locação (ver confirmarModalExcluirAnuncio). Nesse ponto
                     a exclusão em si não é mais possível, então trocamos a ação principal
                     do modal por "arquivar". -->
                <div class="admin-modal-botoes" id="admModalExcluirAnuncioBotoesPadrao">
                    <button class="admin-btn-secundario" id="admModalExcluirAnuncioCancelar">Cancelar</button>
                    <button class="admin-btn-perigo" id="admModalExcluirAnuncioConfirmar">Excluir</button>
                </div>

                <div class="admin-modal-botoes" id="admModalExcluirAnuncioBotoesArquivar" hidden>
                    <button class="admin-btn-secundario" id="admModalExcluirAnuncioCancelarArquivar">Cancelar</button>
                    <button class="admin-btn-primario" id="admModalExcluirAnuncioConfirmarArquivar">Arquivar anúncio</button>
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
    // Só "removido" exige motivo — voltar pra "ativo" não precisa.
    aviso.style.display = select.value === "removido" ? "inline" : "none";
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

    if (novoStatus === "removido" && !motivo) {
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
    document.getElementById("admModalExcluirAnuncioMotivo").value = "";
    document.getElementById("admModalExcluirAnuncioErro").textContent = "";
    voltarParaModoExcluir();
    document.getElementById("admModalExcluirAnuncioOverlay").hidden = false;

    const btn = document.getElementById("admModalExcluirAnuncioConfirmar");
    const btnNovo = btn.cloneNode(true);
    btn.replaceWith(btnNovo);
    btnNovo.addEventListener("click", confirmarModalExcluirAnuncio);

    const btnArquivar = document.getElementById("admModalExcluirAnuncioConfirmarArquivar");
    const btnArquivarNovo = btnArquivar.cloneNode(true);
    btnArquivar.replaceWith(btnArquivarNovo);
    btnArquivarNovo.addEventListener("click", confirmarArquivarAnuncio);

    document.getElementById("admModalExcluirAnuncioCancelarArquivar")
        .addEventListener("click", fecharModalExcluirAnuncio);
}

function fecharModalExcluirAnuncio() {
    document.getElementById("admModalExcluirAnuncioOverlay").hidden = true;
    _anuncioExcluirAtual = null;
    _callbackExcluirAnuncio = null;
}

// Volta o modal pro estado normal de "excluir" (campo de motivo + botão
// Excluir). Usado ao abrir o modal e caso o admin cancele a oferta de
// arquivar sem fechar tudo.
function voltarParaModoExcluir() {
    document.getElementById("admModalExcluirAnuncioMotivoCampo").hidden = false;
    document.getElementById("admModalExcluirAnuncioBotoesPadrao").hidden = false;
    document.getElementById("admModalExcluirAnuncioBotoesArquivar").hidden = true;
}

// Troca o modal pra oferta de "arquivar em vez de excluir" — chamado
// quando o back recusa a exclusão porque o anúncio já teve locações no
// histórico. O motivo já digitado é reaproveitado se o admin confirmar
// o arquivamento (senão fica só como registro do que ele tentou fazer).
function oferecerArquivarNoLugar(mensagem) {
    document.getElementById("admModalExcluirAnuncioErro").textContent = mensagem;
    document.getElementById("admModalExcluirAnuncioMotivoCampo").hidden = true;
    document.getElementById("admModalExcluirAnuncioBotoesPadrao").hidden = true;
    document.getElementById("admModalExcluirAnuncioBotoesArquivar").hidden = false;
}

async function confirmarModalExcluirAnuncio() {
    const anuncio = _anuncioExcluirAtual;
    const motivo = document.getElementById("admModalExcluirAnuncioMotivo").value.trim();
    const erroEl = document.getElementById("admModalExcluirAnuncioErro");
    erroEl.textContent = "";

    if (!motivo) {
        erroEl.textContent = "Informe o motivo da exclusão.";
        return;
    }

    const botao = document.getElementById("admModalExcluirAnuncioConfirmar");
    botao.disabled = true;
    try {
        await excluirAnuncioAdmin(anuncio.id, motivo);
    } catch (err) {
        botao.disabled = false;
        if (err.sugerirArquivar) { oferecerArquivarNoLugar(err.message); return; }
        erroEl.textContent = err.message;
        return;
    }

    window.mostrarToastAdmin(`"${anuncio.titulo}" foi excluído`, "sucesso");

    const callback = _callbackExcluirAnuncio;
    fecharModalExcluirAnuncio();
    if (callback) callback();
}

async function confirmarArquivarAnuncio() {
    const anuncio = _anuncioExcluirAtual;
    const motivo = document.getElementById("admModalExcluirAnuncioMotivo").value.trim();

    const botao = document.getElementById("admModalExcluirAnuncioConfirmarArquivar");
    botao.disabled = true;
    try { await alterarStatusAnuncioAdmin(anuncio.id, "arquivado", motivo); }
    catch (err) {
        document.getElementById("admModalExcluirAnuncioErro").textContent = err.message;
        botao.disabled = false;
        return;
    }

    window.mostrarToastAdmin(`"${anuncio.titulo}" foi arquivado`, "sucesso");

    const callback = _callbackExcluirAnuncio;
    fecharModalExcluirAnuncio();
    if (callback) callback();
}