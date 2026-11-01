/**
 * notificacoes.js (admin)
 * ------------------------------------------------------------------
 * Central de Notificações: criar (rascunho / agendar / enviar agora / teste),
 * editar e excluir itens do histórico.
 *
 * Proteções pensadas pra situações em que o admin pode se meter:
 *   - confirmação com a contagem de destinatários antes de enviar
 *   - "Enviar teste para mim" (só a conta do próprio admin recebe)
 *   - chave de idempotência: clique duplo / retry de rede não envia 2x
 *   - aviso ao sair da página com texto não salvo + cópia local do formulário
 *     (recupera o texto se a sessão expirar)
 *   - aviso de excesso de envios (mesmo público nas últimas 24h)
 *   - status "enviando" (atualiza sozinho) e "falhou" (dá pra editar e reenviar)
 *
 * Depende de:
 *   - admin-notificacoes-api.js
 *   - window.mostrarToastAdmin (admin-frame.js; se faltar, o toast é ignorado)
 * ------------------------------------------------------------------
 */

const escAdmin = valor => String(valor ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

const POR_PAGINA = 10;
const LIMITE_MENSAGEM = 500;
const INTERVALO_ATUALIZAR_ENVIANDO_MS = 5000;
const VALIDADE_ALCANCE_MS = 60 * 1000;
const JANELA_EXCESSO_MS = 24 * 60 * 60 * 1000;
const CHAVE_LOCAL = "admnot:formulario";
const VALIDADE_LOCAL_MS = 7 * 24 * 60 * 60 * 1000;

const DESTINATARIOS_LABEL = {
    todos: "Todos os usuários",
    ativos: "Usuários ativos",
    proprietarios: "Proprietários",
    locatarios: "Locatários",
    novos: "Usuários novos (últimos 30 dias)"
};
const STATUS_LABEL = { enviada: "Enviada", agendada: "Agendada", rascunho: "Rascunho", enviando: "Enviando", falhou: "Falhou" };
// Só esses podem ser editados/excluídos pelo admin.
const STATUS_EDITAVEIS = new Set(["rascunho", "agendada", "falhou"]);

const estado = {
    pagina: 1,
    total: 0,
    itens: [],
    editandoId: null,
    ocupado: false,
    chaveEnvio: null,
    base: { titulo: "", mensagem: "", destinatarios: "todos" },
    timerAtualizacao: null
};

// ================= ELEMENTOS =================
const el = id => document.getElementById(id);

const campoTitulo = el("admnotTitulo");
const campoMensagem = el("admnotMensagem");
const campoDestinatarios = el("admnotDestinatarios");
const contadorEl = el("admnotContador");
const alcanceEl = el("admnotAlcance");
const avisoEl = el("admnotAviso");
const erroEl = el("admnotErro");
const formTituloEl = el("admnotFormTitulo");
const editandoEl = el("admnotEditando");

const btnRascunho = el("btnRascunho");
const btnAgendar = el("btnAgendar");
const btnEnviar = el("btnEnviar");
const btnTeste = el("btnTeste");
const btnVerMais = el("btnVerMais");

const listaEl = el("admnotLista");
const vazioEl = el("admnotVazio");

function toast(mensagem, tipo) {
    if (typeof window.mostrarToastAdmin === "function") window.mostrarToastAdmin(mensagem, tipo);
}

// ================= FORMATAÇÃO =================
function formatarDataHora(iso) {
    if (!iso) return "—";
    const data = new Date(iso);
    if (Number.isNaN(data.getTime())) return "—";
    return `${data.toLocaleDateString("pt-BR")} ${data.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}`;
}

function formatarNumero(n) {
    return Number.isFinite(Number(n)) ? Number(n).toLocaleString("pt-BR") : "—";
}

function paraInputLocal(data) {
    const pad = n => String(n).padStart(2, "0");
    return `${data.getFullYear()}-${pad(data.getMonth() + 1)}-${pad(data.getDate())}T${pad(data.getHours())}:${pad(data.getMinutes())}`;
}

function rotuloDestinatarios(chave) {
    return DESTINATARIOS_LABEL[chave] || chave;
}

// ================= CHAVE DE IDEMPOTÊNCIA =================
// Uma chave por "tentativa de envio". Enquanto o admin não mexer no formulário,
// um retry (clique duplo, rede que caiu depois do servidor processar) reusa a
// mesma chave e o back devolve o mesmo resultado em vez de enviar de novo.
function gerarChave() {
    if (window.crypto && typeof window.crypto.randomUUID === "function") return window.crypto.randomUUID();
    return `k-${Date.now()}-${Math.random().toString(36).slice(2, 12)}`;
}

function chaveAtual() {
    if (!estado.chaveEnvio) estado.chaveEnvio = gerarChave();
    return estado.chaveEnvio;
}

// ================= FORMULÁRIO =================
function atualizarContador() {
    contadorEl.textContent = `${campoMensagem.value.length} / ${LIMITE_MENSAGEM} caracteres`;
}

function mostrarErro(texto) {
    erroEl.textContent = texto || "";
}

function definirOcupado(ocupado) {
    estado.ocupado = ocupado;
    [btnRascunho, btnAgendar, btnEnviar, btnTeste].forEach(b => { b.disabled = ocupado; });
}

function lerFormulario() {
    return {
        titulo: campoTitulo.value.trim(),
        mensagem: campoMensagem.value.trim(),
        destinatarios: campoDestinatarios.value
    };
}

// acao: "rascunho" | "agendar" | "enviar". Devolve o texto do erro ou "" se estiver ok.
function validar(dados, acao) {
    if (dados.titulo.length < 3) return "Informe um título com pelo menos 3 caracteres.";
    if (acao !== "rascunho" && dados.mensagem.length < 5) return "Escreva a mensagem (mínimo 5 caracteres) antes de enviar ou agendar.";
    return "";
}

function definirBase(titulo, mensagem, destinatarios) {
    estado.base = { titulo, mensagem, destinatarios };
}

function formularioSujo() {
    const atual = lerFormulario();
    return atual.titulo !== estado.base.titulo
        || atual.mensagem !== estado.base.mensagem
        || atual.destinatarios !== estado.base.destinatarios;
}

function limparFormulario() {
    campoTitulo.value = "";
    campoMensagem.value = "";
    campoDestinatarios.value = "todos";
    estado.editandoId = null;
    estado.chaveEnvio = null;
    definirBase("", "", "todos");
    editandoEl.hidden = true;
    formTituloEl.textContent = "Nova Notificação";
    mostrarErro("");
    atualizarContador();
    limparLocal();
    atualizarAlcance();
    verificarExcesso();
}

function carregarNoFormulario(item) {
    campoTitulo.value = item.titulo || "";
    campoMensagem.value = item.mensagem || "";
    campoDestinatarios.value = DESTINATARIOS_LABEL[item.destinatarios] ? item.destinatarios : "todos";
    estado.editandoId = item.id;
    estado.chaveEnvio = null;
    definirBase(campoTitulo.value.trim(), campoMensagem.value.trim(), campoDestinatarios.value);
    editandoEl.hidden = false;
    formTituloEl.textContent = "Editar Notificação";
    mostrarErro("");
    atualizarContador();
    atualizarAlcance();
    verificarExcesso();
    window.scrollTo({ top: 0, behavior: "smooth" });
    campoTitulo.focus({ preventScroll: true });
}

// Qualquer mudança no formulário: nova chave (é outro conteúdo), cópia local e aviso de excesso.
function aoMudarFormulario() {
    estado.chaveEnvio = null;
    salvarLocal();
}

[campoTitulo, campoMensagem].forEach(c => c.addEventListener("input", aoMudarFormulario));
campoMensagem.addEventListener("input", atualizarContador);
campoDestinatarios.addEventListener("change", () => {
    aoMudarFormulario();
    atualizarAlcance();
    verificarExcesso();
});
el("admnotCancelarEdicao").addEventListener("click", limparFormulario);

// ================= CÓPIA LOCAL (sessão expirada / aba fechada sem querer) =================
function salvarLocal() {
    try {
        if (estado.editandoId) return;
        const dados = lerFormulario();
        if (!dados.titulo && !dados.mensagem) {
            localStorage.removeItem(CHAVE_LOCAL);
            return;
        }
        localStorage.setItem(CHAVE_LOCAL, JSON.stringify({ ...dados, salvoEm: Date.now() }));
    } catch (e) { /* storage indisponível: segue sem cópia local */ }
}

function limparLocal() {
    try { localStorage.removeItem(CHAVE_LOCAL); } catch (e) { /* ignora */ }
}

function restaurarLocal() {
    try {
        const bruto = localStorage.getItem(CHAVE_LOCAL);
        if (!bruto) return;
        const dados = JSON.parse(bruto);
        if (!dados || Date.now() - Number(dados.salvoEm) > VALIDADE_LOCAL_MS) {
            localStorage.removeItem(CHAVE_LOCAL);
            return;
        }
        campoTitulo.value = dados.titulo || "";
        campoMensagem.value = dados.mensagem || "";
        if (DESTINATARIOS_LABEL[dados.destinatarios]) campoDestinatarios.value = dados.destinatarios;
        atualizarContador();
        toast("Recuperamos o texto que você estava escrevendo.", "info");
    } catch (e) { /* cópia corrompida: ignora */ }
}

// Avisa ao sair/recarregar com texto que ainda não foi salvo nem enviado.
window.addEventListener("beforeunload", (e) => {
    if (!formularioSujo()) return;
    e.preventDefault();
    e.returnValue = "";
});

// ================= ALCANCE (quantos usuários recebem) =================
const cacheAlcance = new Map();

async function obterAlcance(segmento) {
    const guardado = cacheAlcance.get(segmento);
    if (guardado && Date.now() - guardado.em < VALIDADE_ALCANCE_MS) return guardado.quantidade;
    const resposta = await contarDestinatariosNotificacaoAdmin(segmento);
    const quantidade = Number(resposta?.quantidade);
    if (!Number.isFinite(quantidade)) throw new Error("Contagem inválida");
    cacheAlcance.set(segmento, { quantidade, em: Date.now() });
    return quantidade;
}

async function atualizarAlcance() {
    const segmento = campoDestinatarios.value;
    alcanceEl.textContent = "Calculando alcance...";
    try {
        const q = await obterAlcance(segmento);
        if (campoDestinatarios.value !== segmento) return; // o admin já trocou de público
        alcanceEl.textContent = `Hoje isso alcança ${formatarNumero(q)} usuário${q === 1 ? "" : "s"}.`;
    } catch (err) {
        if (campoDestinatarios.value === segmento) alcanceEl.textContent = "";
    }
}

// ================= AVISO DE EXCESSO DE ENVIOS =================
function verificarExcesso() {
    const segmento = campoDestinatarios.value;
    const limite = Date.now() - JANELA_EXCESSO_MS;

    const recente = estado.itens.find(item => {
        if (!["enviada", "enviando"].includes(item.status)) return false;
        const quando = new Date(item.enviada_em || item.criado_em).getTime();
        if (!(quando >= limite)) return false;
        return item.destinatarios === segmento || item.destinatarios === "todos" || segmento === "todos";
    });

    if (!recente) {
        avisoEl.hidden = true;
        avisoEl.textContent = "";
        return;
    }
    avisoEl.hidden = false;
    avisoEl.textContent = `Atenção: nas últimas 24h você já enviou "${recente.titulo}" para ${rotuloDestinatarios(recente.destinatarios).toLowerCase()}. Evite excesso de envios.`;
}

// ================= MODAIS =================
// Confirmação genérica: devolve uma Promise<boolean>.
function confirmar({ titulo, texto, botao = "Confirmar", perigo = false }) {
    return new Promise(resolve => {
        const overlay = el("modalConfirmarOverlay");
        const ok = el("modalConfirmarOk");
        const cancelar = el("modalConfirmarCancelar");

        el("modalConfirmarTitulo").textContent = titulo;
        el("modalConfirmarTexto").innerHTML = texto; // o chamador escapa o que vier do usuário
        ok.textContent = botao;
        ok.className = perigo ? "admin-btn-perigo" : "admin-btn-primario";
        overlay.hidden = false;

        function encerrar(resultado) {
            overlay.hidden = true;
            ok.removeEventListener("click", aoConfirmar);
            cancelar.removeEventListener("click", aoCancelar);
            overlay.removeEventListener("click", aoClicarFora);
            resolve(resultado);
        }
        const aoConfirmar = () => encerrar(true);
        const aoCancelar = () => encerrar(false);
        const aoClicarFora = e => { if (e.target === overlay) encerrar(false); };

        ok.addEventListener("click", aoConfirmar);
        cancelar.addEventListener("click", aoCancelar);
        overlay.addEventListener("click", aoClicarFora);
    });
}

// Escolha de data/hora: devolve uma Promise<string ISO | null>.
function escolherDataAgendamento(destinatarios) {
    return new Promise(resolve => {
        const overlay = el("modalAgendarOverlay");
        const input = el("modalAgendarData");
        const erro = el("modalAgendarErro");
        const ok = el("modalAgendarConfirmar");
        const cancelar = el("modalAgendarCancelar");

        el("modalAgendarDestino").textContent = rotuloDestinatarios(destinatarios);
        let fuso = "";
        try { fuso = Intl.DateTimeFormat().resolvedOptions().timeZone || ""; } catch (e) { /* ignora */ }
        el("modalAgendarFuso").textContent = fuso
            ? `Horário do seu navegador (${fuso}).`
            : "Horário do seu navegador.";
        erro.textContent = "";

        const agora = new Date();
        input.min = paraInputLocal(agora);
        if (!input.value || input.value < input.min) {
            input.value = paraInputLocal(new Date(agora.getTime() + 60 * 60 * 1000));
        }
        overlay.hidden = false;
        input.focus();

        function encerrar(resultado) {
            overlay.hidden = true;
            ok.removeEventListener("click", aoConfirmar);
            cancelar.removeEventListener("click", aoCancelar);
            overlay.removeEventListener("click", aoClicarFora);
            resolve(resultado);
        }
        function aoConfirmar() {
            const data = new Date(input.value);
            if (!input.value || Number.isNaN(data.getTime())) {
                erro.textContent = "Escolha a data e o horário do envio.";
                return;
            }
            if (data.getTime() <= Date.now()) {
                erro.textContent = "O horário precisa ser no futuro.";
                return;
            }
            encerrar(data.toISOString());
        }
        const aoCancelar = () => encerrar(null);
        const aoClicarFora = e => { if (e.target === overlay) encerrar(null); };

        ok.addEventListener("click", aoConfirmar);
        cancelar.addEventListener("click", aoCancelar);
        overlay.addEventListener("click", aoClicarFora);
    });
}

// ================= SALVAR =================
async function salvar(acao) {
    if (estado.ocupado) return;
    mostrarErro("");

    const dados = lerFormulario();
    const problema = validar(dados, acao);
    if (problema) {
        mostrarErro(problema);
        return;
    }

    const payload = { ...dados, status: "rascunho", agendada_para: null, chave_idempotencia: chaveAtual() };

    if (acao === "enviar") {
        let alcance = "";
        try {
            const q = await obterAlcance(dados.destinatarios);
            alcance = ` (cerca de <strong>${formatarNumero(q)}</strong> usuário${q === 1 ? "" : "s"})`;
        } catch (e) { /* sem contagem: confirma sem o número */ }

        const okEnviar = await confirmar({
            titulo: "Enviar agora?",
            texto: `A notificação <strong>${escAdmin(dados.titulo)}</strong> será enviada agora para <strong>${escAdmin(rotuloDestinatarios(dados.destinatarios))}</strong>${alcance}. Depois de enviada, não dá para desfazer.`,
            botao: "Enviar agora"
        });
        if (!okEnviar) return;
        payload.status = "enviada";
    }

    if (acao === "agendar") {
        const quando = await escolherDataAgendamento(dados.destinatarios);
        if (!quando) return;
        payload.status = "agendada";
        payload.agendada_para = quando;
    }

    definirOcupado(true);
    let resposta;
    try {
        resposta = estado.editandoId
            ? await atualizarNotificacaoAdmin(estado.editandoId, payload)
            : await criarNotificacaoAdmin(payload);
    } catch (err) {
        // Mantém a chave: se o servidor chegou a processar, o retry não duplica.
        mostrarErro(err.message);
        definirOcupado(false);
        return;
    }
    definirOcupado(false);

    if (payload.status === "enviada") {
        toast(resposta?.status === "enviando"
            ? "Envio iniciado. Acompanhe o status no histórico."
            : "Notificação enviada", "sucesso");
    } else {
        toast(payload.status === "agendada" ? "Envio agendado" : "Rascunho salvo", "sucesso");
    }

    limparFormulario();
    await Promise.all([carregarHistorico(true), carregarEstatisticas()]);
}

async function enviarTeste() {
    if (estado.ocupado) return;
    mostrarErro("");

    const dados = lerFormulario();
    const problema = validar(dados, "enviar");
    if (problema) {
        mostrarErro(problema);
        return;
    }

    definirOcupado(true);
    try {
        await enviarTesteNotificacaoAdmin({ titulo: dados.titulo, mensagem: dados.mensagem });
    } catch (err) {
        mostrarErro(err.message);
        definirOcupado(false);
        return;
    }
    definirOcupado(false);
    toast("Teste enviado para a sua conta. Confira o sino.", "sucesso");
}

btnRascunho.addEventListener("click", () => salvar("rascunho"));
btnAgendar.addEventListener("click", () => salvar("agendar"));
btnEnviar.addEventListener("click", () => salvar("enviar"));
btnTeste.addEventListener("click", enviarTeste);

// ================= ESTATÍSTICAS =================
async function carregarEstatisticas() {
    try {
        const s = await estatisticasNotificacoesAdmin();
        el("statEnviadas").textContent = formatarNumero(s.enviadas);
        el("statAgendadas").textContent = formatarNumero(s.agendadas);
        el("statTotalUsuarios").textContent = formatarNumero(s.total_usuarios);
    } catch (err) {
        console.error(err);
    }
}

// ================= HISTÓRICO =================
function dataDoItem(item) {
    if (item.status === "enviada") return { icone: "bi-clock", texto: formatarDataHora(item.enviada_em || item.criado_em) };
    if (item.status === "agendada") return { icone: "bi-calendar-event", texto: formatarDataHora(item.agendada_para) };
    return { icone: "bi-clock", texto: formatarDataHora(item.atualizado_em || item.criado_em) };
}

function renderizarHistorico() {
    vazioEl.hidden = estado.itens.length > 0;

    listaEl.innerHTML = estado.itens.map(item => {
        const editavel = STATUS_EDITAVEIS.has(item.status);
        const data = dataDoItem(item);
        const status = STATUS_LABEL[item.status] ? item.status : "rascunho";
        const autor = item.criado_por?.nome
            ? `<span><i class="bi bi-person"></i> por ${escAdmin(item.criado_por.nome)}</span>`
            : "";
        const total = item.total_destinatarios != null
            ? `<span><i class="bi bi-send-check"></i> ${escAdmin(formatarNumero(item.total_destinatarios))} destinatário${Number(item.total_destinatarios) === 1 ? "" : "s"}</span>`
            : "";
        const erro = item.status === "falhou"
            ? `<p class="admnot-item-erro"><i class="bi bi-exclamation-triangle"></i> ${escAdmin(item.erro_envio || "O envio falhou. Edite e tente enviar de novo.")}</p>`
            : "";

        return `
            <article class="admnot-item" data-id="${escAdmin(item.id)}">
                <div class="admnot-item-topo">
                    <h3>${escAdmin(item.titulo)}</h3>
                    <span class="admnot-badge ${status}">${STATUS_LABEL[status]}</span>
                    ${editavel ? `
                    <div class="admnot-item-acoes">
                        <button type="button" class="admnot-item-acao editar" data-acao="editar" title="${status === "falhou" ? "Editar e reenviar" : "Editar"}" aria-label="Editar"><i class="bi bi-pencil"></i></button>
                        <button type="button" class="admnot-item-acao excluir" data-acao="excluir" title="Excluir" aria-label="Excluir"><i class="bi bi-trash"></i></button>
                    </div>` : ""}
                </div>
                <p class="admnot-item-msg">${escAdmin(item.mensagem)}</p>
                ${erro}
                <div class="admnot-item-meta">
                    <span><i class="bi bi-people"></i> ${escAdmin(rotuloDestinatarios(item.destinatarios))}</span>
                    <span><i class="bi ${data.icone}"></i> ${escAdmin(data.texto)}</span>
                    ${total}
                    ${autor}
                </div>
            </article>
        `;
    }).join("");

    btnVerMais.hidden = estado.itens.length >= estado.total;
    verificarExcesso();
    agendarAtualizacaoSeEnviando();
}

// reiniciar = true volta pra 1ª página; false acrescenta a próxima ("Ver mais").
async function carregarHistorico(reiniciar) {
    const pagina = reiniciar ? 1 : estado.pagina + 1;

    try {
        const resposta = await listarNotificacoesAdmin({ pagina, porPagina: POR_PAGINA });
        const novos = resposta.dados || [];
        estado.total = Number(resposta.total) || 0;
        estado.pagina = pagina;
        estado.itens = reiniciar ? novos : [...estado.itens, ...novos];
    } catch (err) {
        if (reiniciar) listaEl.innerHTML = `<p class="admin-tabela-vazio">${escAdmin(err.message)}</p>`;
        else toast(err.message, "erro");
        vazioEl.hidden = true;
        btnVerMais.hidden = true;
        return;
    }

    renderizarHistorico();
}

// Enquanto existir algum "enviando", recarrega sozinho (mantendo o que já foi
// carregado com "Ver mais") até todos terminarem.
function agendarAtualizacaoSeEnviando() {
    clearTimeout(estado.timerAtualizacao);
    if (!estado.itens.some(i => i.status === "enviando")) return;
    estado.timerAtualizacao = setTimeout(recarregarSilencioso, INTERVALO_ATUALIZAR_ENVIANDO_MS);
}

async function recarregarSilencioso() {
    const paginasCarregadas = Math.max(1, Math.ceil(estado.itens.length / POR_PAGINA));
    try {
        const resposta = await listarNotificacoesAdmin({ pagina: 1, porPagina: paginasCarregadas * POR_PAGINA });
        estado.itens = resposta.dados || [];
        estado.total = Number(resposta.total) || 0;
        estado.pagina = paginasCarregadas;
        carregarEstatisticas();
    } catch (err) {
        console.error(err);
    }
    renderizarHistorico(); // reagenda sozinho se ainda houver "enviando"
}

btnVerMais.addEventListener("click", async () => {
    btnVerMais.disabled = true;
    await carregarHistorico(false);
    btnVerMais.disabled = false;
});

listaEl.addEventListener("click", async (e) => {
    const btn = e.target.closest("[data-acao]");
    if (!btn) return;

    const id = btn.closest(".admnot-item").dataset.id;
    const item = estado.itens.find(n => String(n.id) === id);
    if (!item) return;

    if (btn.dataset.acao === "editar") {
        if (formularioSujo() && !confirm("Você tem texto não salvo no formulário. Substituir pelo item selecionado?")) return;
        carregarNoFormulario(item);
        return;
    }

    if (btn.dataset.acao === "excluir") {
        const titulos = { agendada: "Cancelar envio agendado?", falhou: "Excluir envio que falhou?", rascunho: "Excluir rascunho?" };
        const ok = await confirmar({
            titulo: titulos[item.status] || "Excluir notificação?",
            texto: `<strong>${escAdmin(item.titulo)}</strong> será removida do histórico${item.status === "agendada" ? " e não será enviada" : ""}. Essa ação não pode ser desfeita.`,
            botao: "Excluir",
            perigo: true
        });
        if (!ok) return;

        try {
            await excluirNotificacaoAdmin(item.id);
        } catch (err) {
            toast(err.message, "erro");
            return;
        }

        if (estado.editandoId === item.id) limparFormulario();
        toast("Notificação excluída", "sucesso");
        await Promise.all([carregarHistorico(true), carregarEstatisticas()]);
    }
});

// ================= INÍCIO =================
restaurarLocal();
atualizarContador();
atualizarAlcance();
carregarEstatisticas();
carregarHistorico(true);