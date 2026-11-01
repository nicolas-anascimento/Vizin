/**
 * categorias-acoes.js
 * ------------------------------------------------------------------
 * Modal de "criar/editar categoria" (nome, ícone, cor) e modal de
 * "excluir categoria" — mesmo padrão de admin-usuario-acoes.js e
 * admin-anuncio-acoes.js: modais injetados uma única vez via
 * garantirModaisCategoria(), classes admin-modal-overlay/admin-modal/
 * admin-form-campo/admin-form-erro/admin-modal-botoes/admin-btn-*
 * (definidas em admin-shared.css), e o botão de confirmar é clonado
 * antes de religar o clique pra não empilhar listener a cada abertura.
 *
 * Uso:
 *   abrirModalCategoria(categoria, categoriasAtuais, (categoriaSalva) => { ...recarregar... });
 *   abrirModalCategoria(null, categoriasAtuais, callback);  // criar
 *   abrirModalExcluirCategoria(categoria, categoriasAtuais, () => { ...recarregar... });
 *
 * O modal de excluir usa `categoriasAtuais` pra decidir entre 3 situações:
 * exclusão normal, aviso de "última categoria da plataforma" (sem itens mas
 * não sobra nenhuma outra), ou bloqueio com opção de mover os itens pra
 * outra categoria antes de excluir (quando ainda há itens).
 *
 * Depende de:
 *   - categorias-api.js desta pasta (criarCategoriaAdmin, atualizarCategoriaAdmin,
 *     excluirCategoriaAdmin, moverItensCategoriaAdmin)
 *   - window.mostrarToastAdmin (definido em admin-frame.js; se faltar, o toast é ignorado)
 * ------------------------------------------------------------------
 */

const escCategoriaAcoes = valor => String(valor ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"})[c]);

// =====================================================
// OPÇÕES FIXAS (usadas também por categorias.js pra validar o que a
// API devolve antes de jogar no HTML/style — ver iconeCategoriaValido/
// corCategoriaValida/fundoClaroCategoria).
// =====================================================
const ICONES_CATEGORIA_ADMIN = [
    { id: "bi-wrench",             label: "Ferramentas" },
    { id: "bi-laptop",             label: "Eletrônicos" },
    { id: "bi-house-door",         label: "Casa" },
    { id: "bi-camera",             label: "Fotografia" },
    { id: "bi-music-note-beamed",  label: "Instrumentos" },
    { id: "bi-car-front",          label: "Automotivo" },
    { id: "bi-bicycle",            label: "Esportes" },
    { id: "bi-controller",         label: "Games" },
    { id: "bi-book",               label: "Livros" },
    { id: "bi-tree",               label: "Jardinagem" },
    { id: "bi-brush",              label: "Arte" },
    { id: "bi-phone",              label: "Celulares" },
    { id: "bi-lamp",               label: "Decoração" },
    { id: "bi-headphones",         label: "Áudio" },
    { id: "bi-box-seam",           label: "Outros" }
];

const CORES_CATEGORIA_ADMIN = ["#6D49F2", "#F27C38", "#381D73", "#22C55E", "#3B82F6", "#EAB308", "#EF4444", "#EC4899"];

const ICONE_PADRAO_ADMIN = ICONES_CATEGORIA_ADMIN[0].id;
const COR_PADRAO_ADMIN = CORES_CATEGORIA_ADMIN[0];

function iconeCategoriaValido(id) {
    return ICONES_CATEGORIA_ADMIN.some(i => i.id === id) ? id : "bi-box-seam";
}

function corCategoriaValida(cor) {
    return /^#[0-9a-f]{6}$/i.test(String(cor || "")) ? cor : COR_PADRAO_ADMIN;
}

function fundoClaroCategoria(cor) {
    return `${cor}24`; // hex + alpha ≈ 14%
}

function toastAdminCategoria(mensagem, tipo) {
    if (typeof window.mostrarToastAdmin === "function") window.mostrarToastAdmin(mensagem, tipo);
}

let _categoriaEditandoAtual = null; // null => criando
let _categoriasParaChecarDuplicidade = [];
let _callbackCategoria = null;
let _categoriaExcluirAtual = null;
let _callbackExcluirCategoria = null;
let _corSelecionada = COR_PADRAO_ADMIN;

// Cria os dois modais uma única vez e anexa no <body>, caso ainda
// não existam nessa página.
function garantirModaisCategoria() {
    if (document.getElementById("admModalCategoriaOverlay")) return;

    const opcoesIcone = ICONES_CATEGORIA_ADMIN
        .map(i => `<option value="${i.id}">${i.label}</option>`)
        .join("");

    const swatchesCor = CORES_CATEGORIA_ADMIN
        .map(cor => `<button type="button" class="categoria-cor-swatch" data-cor="${cor}" style="background:${cor}" aria-label="Cor ${cor}"></button>`)
        .join("");

    const wrapper = document.createElement("div");
    wrapper.innerHTML = `
        <div class="admin-modal-overlay" id="admModalCategoriaOverlay" hidden>
            <div class="admin-modal">
                <h3 id="admModalCategoriaTitulo">Nova Categoria</h3>

                <div class="admin-form-campo">
                    <label for="admModalCategoriaNome">Nome da Categoria</label>
                    <input type="text" id="admModalCategoriaNome" maxlength="40" placeholder="Ex: Esportes, Jardinagem..." autocomplete="off">
                </div>

                <div class="admin-form-campo">
                    <label for="admModalCategoriaIcone">Ícone</label>
                    <div class="categoria-select-icone-wrap">
                        <i class="bi" id="admModalCategoriaIconeAtual"></i>
                        <select id="admModalCategoriaIcone">${opcoesIcone}</select>
                    </div>
                </div>

                <div class="admin-form-campo">
                    <label>Cor</label>
                    <div class="categoria-cores-swatches" id="admModalCategoriaCores">${swatchesCor}</div>
                    <p class="categoria-cor-resumo">
                        <span class="categoria-cor-bolinha" id="admModalCategoriaCorBolinha"></span>
                        Cor selecionada: <code id="admModalCategoriaCorHex"></code>
                    </p>
                </div>

                <div class="categoria-previa">
                    <small>Prévia:</small>
                    <div class="categoria-previa-conteudo">
                        <div class="categoria-previa-icone-box" id="admModalCategoriaPreviaIconeBox"><i class="bi" id="admModalCategoriaPreviaIcone"></i></div>
                        <strong id="admModalCategoriaPreviaNome">Nome da categoria</strong>
                    </div>
                </div>

                <p class="admin-form-erro" id="admModalCategoriaErro"></p>

                <div class="admin-modal-botoes">
                    <button class="admin-btn-secundario" id="admModalCategoriaCancelar">Cancelar</button>
                    <button class="admin-btn-primario" id="admModalCategoriaConfirmar">Criar Categoria</button>
                </div>
            </div>
        </div>

        <div class="admin-modal-overlay" id="admModalExcluirCategoriaOverlay" hidden>
            <div class="admin-modal">
                <h3>Excluir categoria</h3>
                <p id="admModalExcluirCategoriaTexto"></p>

                <div class="admin-form-campo" id="admModalExcluirCategoriaMoverCampo" hidden>
                    <label for="admModalExcluirCategoriaMoverSelect">Mover os itens para</label>
                    <select id="admModalExcluirCategoriaMoverSelect"></select>
                </div>

                <p class="admin-form-erro" id="admModalExcluirCategoriaErro"></p>

                <div class="admin-modal-botoes">
                    <button class="admin-btn-secundario" id="admModalExcluirCategoriaCancelar">Cancelar</button>
                    <button class="admin-btn-perigo" id="admModalExcluirCategoriaConfirmar">Excluir</button>
                </div>
            </div>
        </div>
    `;
    document.body.appendChild(wrapper);

    document.getElementById("admModalCategoriaCancelar").addEventListener("click", fecharModalCategoria);
    document.getElementById("admModalExcluirCategoriaCancelar").addEventListener("click", fecharModalExcluirCategoria);

    document.getElementById("admModalCategoriaIcone").addEventListener("change", (e) => {
        atualizarPreviaCategoria(document.getElementById("admModalCategoriaNome").value, e.target.value, _corSelecionada);
    });
    document.getElementById("admModalCategoriaNome").addEventListener("input", (e) => {
        document.getElementById("admModalCategoriaErro").textContent = "";
        atualizarPreviaCategoria(e.target.value, document.getElementById("admModalCategoriaIcone").value, _corSelecionada);
    });
    document.getElementById("admModalCategoriaNome").addEventListener("keydown", (e) => {
        if (e.key === "Enter") document.getElementById("admModalCategoriaConfirmar").click();
    });
    document.getElementById("admModalCategoriaCores").addEventListener("click", (e) => {
        const btn = e.target.closest(".categoria-cor-swatch");
        if (!btn) return;
        _corSelecionada = btn.dataset.cor;
        atualizarPreviaCategoria(
            document.getElementById("admModalCategoriaNome").value,
            document.getElementById("admModalCategoriaIcone").value,
            _corSelecionada
        );
    });
}

function atualizarPreviaCategoria(nome, icone, cor) {
    document.getElementById("admModalCategoriaIconeAtual").className = `bi ${icone}`;
    document.getElementById("admModalCategoriaPreviaIcone").className = `bi ${icone}`;

    const caixa = document.getElementById("admModalCategoriaPreviaIconeBox");
    caixa.style.background = fundoClaroCategoria(cor);
    caixa.style.color = cor;

    document.getElementById("admModalCategoriaPreviaNome").textContent = nome.trim() || "Nome da categoria";
    document.getElementById("admModalCategoriaCorBolinha").style.background = cor;
    document.getElementById("admModalCategoriaCorHex").textContent = cor.toUpperCase();

    document.querySelectorAll(".categoria-cor-swatch").forEach(b => {
        b.classList.toggle("selecionada", b.dataset.cor.toUpperCase() === cor.toUpperCase());
    });
}

// ================= CRIAR / EDITAR =================
// categoriasAtuais: lista carregada na tela, só pra checar nome duplicado
// sem precisar de outra chamada à API. aoConfirmar recebe a categoria
// criada/editada (o que a API devolveu).
function abrirModalCategoria(categoria, categoriasAtuais, aoConfirmar) {
    garantirModaisCategoria();

    _categoriaEditandoAtual = categoria;
    _categoriasParaChecarDuplicidade = categoriasAtuais || [];
    _callbackCategoria = aoConfirmar;
    _corSelecionada = categoria ? corCategoriaValida(categoria.cor) : COR_PADRAO_ADMIN;
    const icone = categoria ? iconeCategoriaValido(categoria.icone) : ICONE_PADRAO_ADMIN;

    document.getElementById("admModalCategoriaTitulo").textContent = categoria ? "Editar Categoria" : "Nova Categoria";
    document.getElementById("admModalCategoriaNome").value = categoria ? categoria.nome : "";
    document.getElementById("admModalCategoriaIcone").value = icone;
    document.getElementById("admModalCategoriaErro").textContent = "";
    atualizarPreviaCategoria(categoria ? categoria.nome : "", icone, _corSelecionada);

    document.getElementById("admModalCategoriaOverlay").hidden = false;

    const btn = document.getElementById("admModalCategoriaConfirmar");
    const btnNovo = btn.cloneNode(true);
    btnNovo.disabled = false; // o clone herda "disabled" de um envio anterior bem-sucedido
    btnNovo.textContent = categoria ? "Salvar alterações" : "Criar Categoria";
    btn.replaceWith(btnNovo);
    btnNovo.addEventListener("click", confirmarModalCategoria);

    document.getElementById("admModalCategoriaNome").focus();
}

function fecharModalCategoria() {
    document.getElementById("admModalCategoriaOverlay").hidden = true;
    _categoriaEditandoAtual = null;
    _callbackCategoria = null;
}

async function confirmarModalCategoria() {
    const nome = document.getElementById("admModalCategoriaNome").value.trim().replace(/\s+/g, " ");
    const icone = document.getElementById("admModalCategoriaIcone").value;
    const cor = _corSelecionada;
    const erroEl = document.getElementById("admModalCategoriaErro");
    erroEl.textContent = "";

    if (!nome) { erroEl.textContent = "Informe o nome da categoria."; return; }
    if (nome.length < 2) { erroEl.textContent = "O nome precisa ter pelo menos 2 caracteres."; return; }

    const editandoId = _categoriaEditandoAtual ? _categoriaEditandoAtual.id : null;
    const duplicada = _categoriasParaChecarDuplicidade.some(c =>
        String(c.id) !== String(editandoId) &&
        c.nome.toLocaleLowerCase("pt-BR") === nome.toLocaleLowerCase("pt-BR")
    );
    if (duplicada) { erroEl.textContent = "Já existe uma categoria com esse nome."; return; }

    const editando = !!_categoriaEditandoAtual;
    const botao = document.getElementById("admModalCategoriaConfirmar");
    botao.disabled = true;

    let resultado;
    try {
        resultado = editando
            ? await atualizarCategoriaAdmin(editandoId, { nome, icone, cor })
            : await criarCategoriaAdmin({ nome, icone, cor });
    } catch (err) {
        erroEl.textContent = err.message;
        botao.disabled = false;
        return;
    }

    toastAdminCategoria(editando ? "Categoria atualizada" : "Categoria criada", "sucesso");

    const callback = _callbackCategoria;
    fecharModalCategoria();
    if (callback) await callback(resultado);
}

// ================= EXCLUIR =================
// A categoria precisa trazer `total` (nº de itens) — ver categorias.js:normalizar.
// Três situações possíveis:
//   1) sem itens e não é a última categoria  -> exclusão normal
//   2) sem itens mas É a última categoria    -> aviso forte (sem categorias,
//      ninguém consegue anunciar objetos), mas continua deixando excluir
//   3) com itens                             -> trava a exclusão direta e
//      oferece mover os itens pra outra categoria já existente antes; se
//      não existir NENHUMA outra categoria, não tem pra onde mover, e a
//      exclusão fica travada de vez até o admin criar uma outra categoria.
// categoriasAtuais: lista completa carregada na tela — usada pra saber se é
// a última categoria e pra montar o select de destino em (3).
function abrirModalExcluirCategoria(categoria, categoriasAtuais, aoConfirmar) {
    garantirModaisCategoria();

    _categoriaExcluirAtual = categoria;
    _callbackExcluirCategoria = aoConfirmar;

    const outrasCategoria = (categoriasAtuais || []).filter(c => String(c.id) !== String(categoria.id));
    const bloqueadaPorItens = categoria.total > 0;
    const semDestino = bloqueadaPorItens && outrasCategoria.length === 0;
    const ultimaCategoria = !bloqueadaPorItens && outrasCategoria.length === 0;
    // Só precisa mover itens quando está bloqueada por itens E existe pra onde mover.
    const precisaMover = bloqueadaPorItens && !semDestino;

    const erroEl = document.getElementById("admModalExcluirCategoriaErro");
    const moverCampo = document.getElementById("admModalExcluirCategoriaMoverCampo");
    const moverSelect = document.getElementById("admModalExcluirCategoriaMoverSelect");

    document.getElementById("admModalExcluirCategoriaTexto").textContent =
        `Tem certeza que deseja excluir "${categoria.nome}"? Essa ação não pode ser desfeita.`;

    if (semDestino) {
        erroEl.textContent =
            `Esta categoria ainda tem ${categoria.total} ${categoria.total === 1 ? "item cadastrado" : "itens cadastrados"}, ` +
            `e não existe outra categoria pra mover esses itens. Crie uma nova categoria antes de excluir esta.`;
        moverCampo.hidden = true;
    } else if (precisaMover) {
        erroEl.textContent =
            `Esta categoria ainda tem ${categoria.total} ${categoria.total === 1 ? "item cadastrado" : "itens cadastrados"}. ` +
            `Escolha para onde mover esses itens antes de excluir.`;
        moverSelect.innerHTML = outrasCategoria
            .map(c => `<option value="${c.id}">${escCategoriaAcoes(c.nome)}</option>`)
            .join("");
        moverCampo.hidden = false;
    } else if (ultimaCategoria) {
        erroEl.textContent =
            `Esta é a última categoria da plataforma. Sem nenhuma categoria cadastrada, ` +
            `ninguém conseguirá anunciar objetos novos até você criar outra.`;
        moverCampo.hidden = true;
    } else {
        erroEl.textContent = "";
        moverCampo.hidden = true;
    }

    document.getElementById("admModalExcluirCategoriaOverlay").hidden = false;

    const btn = document.getElementById("admModalExcluirCategoriaConfirmar");
    const btnNovo = btn.cloneNode(true);
    btnNovo.disabled = semDestino; // única situação realmente travada de vez
    btnNovo.textContent = precisaMover ? "Mover e excluir" : "Excluir";
    btn.replaceWith(btnNovo);
    btnNovo.addEventListener("click", () => confirmarModalExcluirCategoria(precisaMover));
}

function fecharModalExcluirCategoria() {
    document.getElementById("admModalExcluirCategoriaOverlay").hidden = true;
    _categoriaExcluirAtual = null;
    _callbackExcluirCategoria = null;
}

async function confirmarModalExcluirCategoria(precisaMover) {
    const categoria = _categoriaExcluirAtual;
    const erroEl = document.getElementById("admModalExcluirCategoriaErro");
    const botao = document.getElementById("admModalExcluirCategoriaConfirmar");

    let destinoId = null;
    if (precisaMover) {
        destinoId = document.getElementById("admModalExcluirCategoriaMoverSelect").value;
        if (!destinoId) { erroEl.textContent = "Escolha para onde mover os itens."; return; }
    }

    erroEl.textContent = "";
    botao.disabled = true;
    try {
        if (precisaMover) await moverItensCategoriaAdmin(categoria.id, destinoId);
        await excluirCategoriaAdmin(categoria.id);
    } catch (err) {
        erroEl.textContent = err.message;
        botao.disabled = false;
        return;
    }

    toastAdminCategoria(`"${categoria.nome}" foi excluída`, "sucesso");

    const callback = _callbackExcluirCategoria;
    fecharModalExcluirCategoria();
    if (callback) await callback();
}