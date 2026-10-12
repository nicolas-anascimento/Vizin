/**
 * notificacoes-shared.js
 * ------------------------------------------------------------------
 * Pedaços compartilhados entre a central (notificacoes.js) e a tela
 * Início (inicio.js): categorias, ícones, rotas de "Ver detalhes",
 * normalização do item do back e o HTML de um card de notificação.
 * Carregar DEPOIS de notificacoes-api.js e ANTES de notificacoes.js/inicio.js.
 * ------------------------------------------------------------------
 */

// Para onde cada tipo de referência leva. `?abrir=<id>` faz a tela de destino
// abrir o item direto (Denúncias, Pagamentos, Anúncios e Avaliações já tratam isso).
const ROTAS_REFERENCIA = {
    usuario:     ref => `/admin/usuarios/detalhe?id=${encodeURIComponent(ref.id)}`,
    objeto:      ref => `/admin/objetos?abrir=${encodeURIComponent(ref.id)}`,
    ocorrencia:  ref => `/admin/denuncias?abrir=${encodeURIComponent(ref.id)}`,
    pagamento:   ref => `/admin/pagamentos?abrir=${encodeURIComponent(ref.id)}`,
    avaliacao:   ref => `/admin/avaliacoes?abrir=${encodeURIComponent(ref.id)}`,
    verificacao: ref => `/admin/verificacoes/analise?id=${encodeURIComponent(ref.id)}`
};

const CATEGORIAS = {
    usuarios:     { label: "Usuários",     cor: "usuarios" },
    anuncios:     { label: "Anúncios",     cor: "anuncios" },
    denuncias:    { label: "Denúncias",    cor: "denuncias" },
    pagamentos:   { label: "Pagamentos",   cor: "pagamentos" },
    avaliacoes:   { label: "Avaliações",   cor: "avaliacoes" },
    verificacoes: { label: "Verificações", cor: "verificacoes" },
    sistema:      { label: "Sistema",      cor: "sistema" }
};

// Ícone por tipo (cai no ícone da categoria se o tipo for desconhecido,
// pra o front não quebrar quando o back criar um tipo novo).
const ICONES_TIPO = {
    novo_usuario: "bi-person-plus",
    usuario_reincidente: "bi-person-exclamation",
    sinal_abuso: "bi-incognito",
    novo_anuncio: "bi-megaphone",
    anuncio_reportado: "bi-flag",
    anuncio_muito_denunciado: "bi-flag-fill",
    denuncia_recebida: "bi-shield-exclamation",
    denuncia_critica_sem_resposta: "bi-alarm",
    ticket_suporte: "bi-headset",
    contestacao_suspensao: "bi-chat-left-dots",
    pagamento_processado: "bi-check-circle",
    pagamento_falhou: "bi-x-octagon",
    pagamento_estornado: "bi-arrow-counterclockwise",
    locacao_atrasada: "bi-clock-history",
    multa_gerada: "bi-receipt",
    avaliacao_negativa: "bi-star-half",
    verificacao_enviada: "bi-patch-question",
    verificacao_reenviada: "bi-arrow-repeat",
    verificacao_atrasada: "bi-hourglass-bottom",
    verificacao_cancelada: "bi-slash-circle",
    sistema_webhook_falhou: "bi-plug",
    sistema_estorno_pendente: "bi-hourglass-split",
    sistema_erro_upload: "bi-cloud-slash"
};
const ICONES_CATEGORIA = {
    usuarios: "bi-people", anuncios: "bi-megaphone", denuncias: "bi-shield-exclamation",
    pagamentos: "bi-credit-card", avaliacoes: "bi-star", verificacoes: "bi-patch-check",
    sistema: "bi-exclamation-octagon"
};

function escNotif(valor) {
    return String(valor ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"})[c]);
}

// Rede de proteção (LGPD): o back NÃO deve mandar CPF nem e-mail completo nas
// mensagens, mas se escapar algum, a tela mascara antes de exibir.
function mascararSensivel(texto) {
    return String(texto ?? "")
        .replace(/\b\d{3}\.?\d{3}\.?\d{3}-?\d{2}\b/g, "•••.•••.•••-••")
        .replace(/\b([A-Za-z0-9._%+-])[A-Za-z0-9._%+-]*@([A-Za-z0-9.-]+\.[A-Za-z]{2,})\b/g, "$1•••@$2");
}

function tempoRelativo(iso) {
    const data = new Date(iso);
    if (Number.isNaN(data.getTime())) return "";
    const seg = Math.max(0, Math.floor((Date.now() - data.getTime()) / 1000));
    if (seg < 60) return "agora há pouco";
    const min = Math.floor(seg / 60);
    if (min < 60) return `há ${min} min`;
    const h = Math.floor(min / 60);
    if (h < 24) return `há ${h} h`;
    const d = Math.floor(h / 24);
    if (d < 7) return `há ${d} dia${d > 1 ? "s" : ""}`;
    return data.toLocaleDateString("pt-BR");
}

function dataCompleta(iso) {
    const data = new Date(iso);
    return Number.isNaN(data.getTime()) ? "" : data.toLocaleString("pt-BR");
}

function normalizarNotificacao(n) {
    return {
        id: String(n.id),
        tipo: n.tipo || "",
        categoria: CATEGORIAS[n.categoria] ? n.categoria : "sistema",
        prioridade: n.prioridade === "alta" ? "alta" : "normal",
        titulo: n.titulo || "Notificação",
        mensagem: n.mensagem || "",
        lida: !!n.lida,
        criadoEm: n.criado_em,
        referencia: n.referencia && n.referencia.tipo && n.referencia.id != null
            ? { tipo: String(n.referencia.tipo), id: String(n.referencia.id) }
            : null,
        // Preenchido quando QUALQUER admin já tratou o item ligado à notificação.
        tratadaPor: n.tratada_por?.nome || null,
        tratadaEm: n.tratada_em || null
    };
}

function urlReferencia(ref) {
    if (!ref || !ROTAS_REFERENCIA[ref.tipo]) return null;
    return ROTAS_REFERENCIA[ref.tipo](ref);
}

// HTML de um card. `acoes: false` (tela Início) esconde os botões de lida/dispensar.
function htmlNotificacao(n, { acoes = true } = {}) {
    const cat = CATEGORIAS[n.categoria];
    const icone = ICONES_TIPO[n.tipo] || ICONES_CATEGORIA[n.categoria] || "bi-bell";
    const link = urlReferencia(n.referencia);
    const tratada = n.tratadaPor
        ? `<div class="admin-notif-tratada"><i class="bi bi-check2-circle"></i> Tratada por ${escNotif(n.tratadaPor)}${n.tratadaEm ? ` em ${escNotif(dataCompleta(n.tratadaEm))}` : ""}</div>`
        : "";

    return `
    <article class="admin-notif ${n.lida ? "lida" : "nao-lida"} ${n.prioridade === "alta" ? "prioridade-alta" : ""}" data-id="${escNotif(n.id)}">
        <div class="admin-notif-icone cat-${cat.cor}"><i class="bi ${icone}"></i></div>
        <div class="admin-notif-corpo">
            <div class="admin-notif-topo">
                <span class="admin-notif-cat cat-${cat.cor}">${escNotif(cat.label)}</span>
                ${n.prioridade === "alta" ? `<span class="admin-notif-urgente"><i class="bi bi-exclamation-triangle-fill"></i> Urgente</span>` : ""}
                <span class="admin-notif-tempo" title="${escNotif(dataCompleta(n.criadoEm))}">${escNotif(tempoRelativo(n.criadoEm))}</span>
            </div>
            <h4 class="admin-notif-titulo">${escNotif(mascararSensivel(n.titulo))}</h4>
            <p class="admin-notif-msg">${escNotif(mascararSensivel(n.mensagem))}</p>
            ${tratada}
            ${link ? `<a class="admin-notif-link" href="${link}" data-acao="abrir">Ver detalhes <i class="bi bi-arrow-right"></i></a>` : ""}
        </div>
        ${acoes ? `
        <div class="admin-acoes admin-notif-acoes">
            <button class="admin-acao-btn ver" data-acao="alternar-leitura" title="${n.lida ? "Marcar como não lida" : "Marcar como lida"}">
                <i class="bi ${n.lida ? "bi-envelope" : "bi-envelope-open"}"></i>
            </button>
            <button class="admin-acao-btn excluir" data-acao="dispensar" title="Dispensar (some só pra você)"><i class="bi bi-x-lg"></i></button>
        </div>` : ""}
    </article>`;
}