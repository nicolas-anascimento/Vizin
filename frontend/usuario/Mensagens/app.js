/**
 * app.js
 * ------------------------------------------------------------------
 * Toda a lógica de interface da página de Mensagens.
 * Não conhece de onde os dados vêm — fala só com API (api.js).
 * ------------------------------------------------------------------
 */
 
const usuarioLogado = JSON.parse(localStorage.getItem("usuario") || "null");
 
// Guarda de sessão: sem usuário logado não tem o que fazer aqui.
// Redireciona pro login já preservando a intenção de voltar pra
// Mensagens depois (o Login pode ler ?redirect= e mandar de volta).
if (!usuarioLogado) {
  window.location.href = "/login?redirect=" + encodeURIComponent(location.pathname + location.search);
}
 
const state = {
  conversations: [],
  activeConversationId: null,
  messages: [],           // mensagens da conversa aberta
};

let realtimeSocket = null;
let typingSent = false;
let typingStopTimer = null;
let remoteTypingTimer = null;
const pendingSendTimers = new Map();
 
const els = {
  app: document.querySelector(".app"),
  convList: document.getElementById("convList"),
  convEmpty: document.getElementById("convEmpty"),
  convError: document.getElementById("convError"),
  retryLoadBtn: document.getElementById("retryLoadBtn"),
  searchInput: document.getElementById("searchInput"),
 
  offlineBanner: document.getElementById("offlineBanner"),
 
  chatEmpty: document.getElementById("chatEmpty"),
  chatActive: document.getElementById("chatActive"),
  chatAvatar: document.getElementById("chatAvatar"),
  chatStatusDot: document.getElementById("chatStatusDot"),
  chatName: document.getElementById("chatName"),
  chatPresence: document.getElementById("chatPresence"),
  chatItemChip: document.getElementById("chatItemChip"),
  chatMenuBtn: document.getElementById("chatMenuBtn"),
  chatMenuDropdown: document.getElementById("chatMenuDropdown"),
  blockedUsersBtn: document.getElementById("blockedUsersBtn"),
  blockUserOption: document.getElementById("blockUserOption"),
  reportConvOption: document.getElementById("reportConvOption"),
  deleteConvOption: document.getElementById("deleteConvOption"),
 
  itemBanner: document.getElementById("itemBanner"),
  safetyNotice: document.getElementById("safetyNotice"),
 
  messagesList: document.getElementById("messagesList"),
  typingIndicator: document.getElementById("typingIndicator"),
 
  composerForm: document.getElementById("composerForm"),
  messageInput: document.getElementById("messageInput"),
  charCounter: document.getElementById("charCounter"),
  sendBtn: document.getElementById("sendBtn"),
 
  attachBtn: document.getElementById("attachBtn"),
  fileInput: document.getElementById("fileInput"),
  attachmentPreview: document.getElementById("attachmentPreview"),
  attachmentPreviewImg: document.getElementById("attachmentPreviewImg"),
  attachmentPreviewName: document.getElementById("attachmentPreviewName"),
  attachmentRemoveBtn: document.getElementById("attachmentRemoveBtn"),
 
  toaste: document.getElementById("toaste"),
 
  // Modal genérico (confirmação de bloqueio/exclusão e formulário de denúncia)
  modalOverlay: document.getElementById("modalOverlay"),
  modalTitle: document.getElementById("modalTitle"),
  modalBody: document.getElementById("modalBody"),
  modalCancelBtn: document.getElementById("modalCancelBtn"),
  modalConfirmBtn: document.getElementById("modalConfirmBtn"),
};
 
let pendingAttachment = null;
 
const MESSAGE_MAX_LENGTH = 2000;
 
const mobileQuery = window.matchMedia("(max-width: 860px)");
 
/* ============================================================
   ÍCONES DOS ITENS (chip da ferramenta em negociação)
   ============================================================ */
const ITEM_ICONS = {
  drill:  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M2 12h10l4-4h6v6h-6l-4-4"/></svg>',
  ladder: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M6 2v20M18 2v20M6 7h12M6 12h12M6 17h12"/></svg>',
  saw:    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 18l20-14M2 18l4-1 1-4 4-1 1-4 4-1"/></svg>',
  tool:   '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14.7 6.3a4 4 0 1 1-5.4 5.4L4 17l3 3 5.3-5.3a4 4 0 1 1 5.4-5.4L21 6l-3-3-3.3 3.3Z"/></svg>'
};
 
function itemIcon(icon) {
  return ITEM_ICONS[icon] || ITEM_ICONS.tool;
}
 
/* ============================================================
   INICIALIZAÇÃO
   ============================================================ */
async function init() {
  bindEvents();
  setupOfflineDetection();
  const session = await (window.SessaoVizin?.pronto ?? Promise.resolve(usuarioLogado));
  if (!session) return;
  await window.SessaoVizin?.realtimePronto;
  setupRealtime();
  await loadConversations();
}
 
// Carrega (ou recarrega, no caso de "Tentar novamente") a lista de
// conversas, tratando falha de rede com uma tela de erro dedicada em
// vez de deixar a lista em branco pra sempre.
async function loadConversations() {
  hideConvError();
  try {
    state.conversations = await API.getConversations();
    renderConversationList(state.conversations);
    await abrirConversaViaQueryParams();
  } catch (err) {
    showConvError();
  }
}
 
function showConvError() {
  els.convList.innerHTML = "";
  els.convEmpty.classList.add("hidden");
  els.convError.classList.remove("hidden");
}
 
function hideConvError() {
  els.convError.classList.add("hidden");
}
 
/* ============================================================
   DETECÇÃO DE OFFLINE
   ============================================================ */
function setupOfflineDetection() {
  const update = () => {
    els.offlineBanner.classList.toggle("hidden", navigator.onLine);
  };
  window.addEventListener("online", update);
  window.addEventListener("offline", update);
  update();
}

function setupRealtime() {
  realtimeSocket = window.SocketVizin?.connect() || null;
  if (!realtimeSocket) return;

  realtimeSocket.on("connect", () => {
    if (state.activeConversationId) {
      realtimeSocket.emit("chat:join", { conversation_id: state.activeConversationId });
    }
  });
  realtimeSocket.on("message:new", onRealtimeMessage);
  realtimeSocket.on("message:ack", onRealtimeAck);
  realtimeSocket.on("message:read:update", onRealtimeRead);
  realtimeSocket.on("typing:update", onRealtimeTyping);
  realtimeSocket.on("conversation:update", onRealtimeConversationUpdate);
  realtimeSocket.on("socket:error", onRealtimeError);
  realtimeSocket.on("disconnect", () => {
    stopTyping();
    els.typingIndicator.classList.add("hidden");
  });
}

function loggedUserId() {
  return String(usuarioLogado?.id || "");
}

async function normalizeRealtimeMessage(message) {
  const normalized = await API.normalizeMessage(message);
  return {
    ...normalized,
    from: message?.sender?.id === loggedUserId() ? "me" : "them"
  };
}

function replaceOrAppendMessage(message) {
  const index = state.messages.findIndex(item =>
    item.id === message.id ||
    (message.client_message_id && item.client_message_id === message.client_message_id) ||
    (message.client_message_id && item.id === message.client_message_id)
  );
  if (index >= 0) state.messages[index] = message;
  else state.messages.push(message);
  state.messages.sort((a, b) => new Date(a.time).getTime() - new Date(b.time).getTime());
}

async function onRealtimeMessage(rawMessage) {
  const conversationId = rawMessage?.conversation_id;
  if (!conversationId || conversationId !== state.activeConversationId) return;
  const message = await normalizeRealtimeMessage(rawMessage);
  replaceOrAppendMessage(message);
  clearPendingSend(message.client_message_id);
  renderMessages(state.messages);
  if (message.from === "them") {
    realtimeSocket?.emit("message:read", { conversation_id: conversationId });
  }
}

async function onRealtimeAck(payload) {
  if (!payload?.message || !payload.client_message_id) return;
  clearPendingSend(payload.client_message_id);
  const message = await normalizeRealtimeMessage(payload.message);
  if (message.conversation_id !== state.activeConversationId) return;
  replaceOrAppendMessage(message);
  renderMessages(state.messages);
}

function onRealtimeRead(payload) {
  if (
    payload?.conversation_id !== state.activeConversationId ||
    payload.user_id === loggedUserId()
  ) return;
  state.messages.forEach(message => {
    if (message.from === "me" && message.status !== "failed") message.status = "read";
  });
  renderMessages(state.messages);
}

function onRealtimeTyping(payload) {
  if (
    payload?.conversation_id !== state.activeConversationId ||
    payload.user_id === loggedUserId()
  ) return;
  clearTimeout(remoteTypingTimer);
  els.typingIndicator.classList.toggle("hidden", !payload.typing);
  if (payload.typing) {
    remoteTypingTimer = setTimeout(() => {
      els.typingIndicator.classList.add("hidden");
    }, 3000);
  }
}

function onRealtimeConversationUpdate(payload) {
  const conversationId = payload?.conversation_id;
  const message = payload?.message;
  if (!conversationId || !message) return;
  const conversation = state.conversations.find(item => item.id === conversationId);
  if (!conversation) {
    loadConversations().catch(() => {});
    return;
  }
  conversation.lastMessage = {
    ...message,
    from: message.sender?.id === loggedUserId() ? "me" : "them"
  };
  if (
    conversationId !== state.activeConversationId &&
    message.sender?.id !== loggedUserId()
  ) {
    conversation.unreadCount = (conversation.unreadCount || 0) + 1;
  }
  state.conversations = [conversation, ...state.conversations.filter(item => item.id !== conversationId)];
  renderConversationList(currentFilteredList());
}

function onRealtimeError(error) {
  if (error?.client_message_id) {
    clearPendingSend(error.client_message_id);
    const message = state.messages.find(item =>
      item.id === error.client_message_id ||
      item.client_message_id === error.client_message_id
    );
    if (message) message.status = "failed";
    if (state.activeConversationId) renderMessages(state.messages);
  }
  if (error?.message) showToast(error.message);
}

function clearPendingSend(clientMessageId) {
  if (!clientMessageId) return;
  clearTimeout(pendingSendTimers.get(clientMessageId));
  pendingSendTimers.delete(clientMessageId);
}
 
// Se a página foi aberta a partir do botão "Conversar" da página do
// objeto (com ?userId=...&produtoId=...), abre a conversa certa —
// criando uma nova se ainda não existir.
async function abrirConversaViaQueryParams() {
  const params = new URLSearchParams(window.location.search);

  // Vindo de uma notificação de "Nova mensagem": /mensagens?conversaId=<id>
  // abre direto a conversa indicada (o ID é sempre string/UUID).
  const conversaId = params.get("conversaId");
  if (conversaId) {
    if (state.conversations.some(c => c.id === conversaId)) {
      openConversation(conversaId);
    } else {
      showToast("Não foi possível encontrar essa conversa.");
    }
    return;
  }

  const userId = params.get("userId");
  if (!userId) return;
 
  const userName = params.get("userName");
  const produtoId = params.get("produtoId");
  const produtoTitulo = params.get("produtoTitulo");
 
  let conv;
  try {
    conv = await API.getOrCreateConversation({
      userId,
      userName,
      produtoId,
      produtoTitulo
    });
  } catch (err) {
    showToast("Não foi possível abrir essa conversa agora.");
    return;
  }
 
  if (!state.conversations.some(c => c.id === conv.id)) {
    state.conversations.unshift({
      id: conv.id,
      user: conv.user,
      item: conv.item,
      unreadCount: conv.unreadCount,
      lastMessage: conv.messages[conv.messages.length - 1] || { text: "", time: new Date().toISOString(), type: "text" }
    });
    renderConversationList(currentFilteredList());
  }
 
  openConversation(conv.id);
}
 
function bindEvents() {
  els.searchInput.addEventListener("input", onSearch);
  els.retryLoadBtn.addEventListener("click", loadConversations);
  els.composerForm.addEventListener("submit", onSendMessage);
  els.messageInput.addEventListener("input", onMessageInputChange);
  els.attachBtn.addEventListener("click", () => els.fileInput.click());
  els.fileInput.addEventListener("change", onFileSelected);
  els.attachmentRemoveBtn.addEventListener("click", clearAttachment);
  els.blockedUsersBtn.addEventListener("click", onBlockedUsersClick);
 
  // Clicar na foto do usuário no cabeçalho do chat ativo leva ao perfil dele
  els.chatAvatar.addEventListener("click", () => {
    const conv = state.conversations.find(c => c.id === state.activeConversationId);
    if (conv?.user?.id) {
      window.location.href = `/perfil?id=${conv.user.id}`;
    }
  });
 
  // Menu "⋮" do chat: bloquear / denunciar / apagar conversa
  els.chatMenuBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    els.chatMenuDropdown.classList.toggle("hidden");
  });
  document.addEventListener("click", () => els.chatMenuDropdown.classList.add("hidden"));
  els.blockUserOption.addEventListener("click", onBlockUserClick);
  els.reportConvOption.addEventListener("click", onReportConvClick);
  els.deleteConvOption.addEventListener("click", onDeleteConvClick);
 
  // Modal genérico
  els.modalCancelBtn.addEventListener("click", closeModal);
  els.modalConfirmBtn.addEventListener("click", async () => {
    if (!modalOnConfirm) return closeModal();
    // Trava o botão pra evitar clique duplo enquanto a ação roda
    // (ex: clicar 2x rápido em "Bloquear" e disparar a API 2x).
    els.modalConfirmBtn.disabled = true;
    try {
      const result = await modalOnConfirm();
      // Só false explícito mantém o modal aberto (ex: validação de
      // campo vazio no formulário de denúncia). Qualquer outro
      // retorno — incluindo undefined — fecha o modal normalmente.
      if (result !== false) closeModal();
    } catch (err) {
      // Se o onConfirm quebrar de forma inesperada depois de já ter
      // feito a ação, o modal não pode ficar preso na tela sem
      // explicação — fecha e avisa.
      console.error("Erro ao confirmar ação do modal:", err);
      closeModal();
      showToast("Algo deu errado. Tente novamente.");
    } finally {
      els.modalConfirmBtn.disabled = false;
    }
  });
  els.modalOverlay.addEventListener("click", (e) => {
    if (e.target === els.modalOverlay) closeModal();
  });
 
  // Botão físico/gesto de voltar do celular fecha o chat em vez de
  // sair da página — mesmo comportamento do WhatsApp Web no mobile.
  window.addEventListener("popstate", () => {
    fecharChatMobile();
  });
}
 
/* ============================================================
   LISTA DE CONVERSAS
   ============================================================ */
function renderConversationList(conversations) {
  els.convList.innerHTML = "";
 
  if (conversations.length === 0) {
    els.convEmpty.classList.remove("hidden");
    return;
  }
  els.convEmpty.classList.add("hidden");
 
  conversations.forEach(conv => {
    const li = document.createElement("li");
    li.className = "conv-item" + (conv.unreadCount > 0 ? " unread" : "") +
      (conv.id === state.activeConversationId ? " active" : "");
    li.dataset.id = conv.id;
    li.setAttribute("role", "listitem");
    li.tabIndex = 0;
 
    const previewMsg = conv.lastMessage || { text: "", type: "text", time: new Date().toISOString() };
 
    li.innerHTML = `
      <div class="avatar">
        <img src="${escapeHtml(conv.user.avatar)}" alt="Foto de ${escapeHtml(conv.user.name)}">
        <span class="status-dot ${conv.user.online ? "online" : ""}"></span>
      </div>
      <div class="conv-item__body">
        <div class="conv-item__top">
          <span class="conv-item__name">${escapeHtml(conv.user.name)}</span>
          <span class="conv-item__time">${formatRelativeTime(previewMsg.time)}</span>
        </div>
        <div class="conv-item__bottom">
          <span class="conv-item__preview">${escapeHtml(previewText(previewMsg))}</span>
          ${conv.unreadCount > 0 ? `<span class="badge">${conv.unreadCount}</span>` : ""}
        </div>
        <span class="item-chip">${itemIcon(conv.item.icon)} ${escapeHtml(conv.item.name)}</span>
      </div>
    `;
 
    li.addEventListener("click", () => openConversation(conv.id));
    li.addEventListener("keydown", e => {
      if (e.key === "Enter") openConversation(conv.id);
    });
 
    els.convList.appendChild(li);
  });
}
 
function previewText(msg) {
  if (!msg.text && !msg.type) return "Diga olá 👋";
  if (msg.type === "image") return "📷 Imagem";
  if (msg.type === "video") return "🎥 Vídeo";
  if (msg.type === "file") return "📎 Arquivo";
  return msg.text || "Diga olá 👋";
}
 
function onSearch() {
  const q = els.searchInput.value.trim().toLowerCase();
  const filtered = state.conversations.filter(c =>
    c.user.name.toLowerCase().includes(q) ||
    c.item.name.toLowerCase().includes(q)
  );
  renderConversationList(filtered);
}
 
/* ============================================================
   ABRIR CONVERSA
   ============================================================ */
async function openConversation(id) {
  const previousConversationId = state.activeConversationId;
  if (previousConversationId && previousConversationId !== id) {
    stopTyping();
    realtimeSocket?.emit("chat:leave", { conversation_id: previousConversationId });
  }
  state.activeConversationId = id;
  const conv = state.conversations.find(c => c.id === id);
  if (!conv) return;
 
  // destaca item ativo na lista
  document.querySelectorAll(".conv-item").forEach(el => {
    el.classList.toggle("active", el.dataset.id === id);
  });
 
  els.chatEmpty.classList.add("hidden");
  els.chatActive.classList.remove("hidden");
 
  els.chatAvatar.src = conv.user.avatar;
  els.chatAvatar.alt = "Foto de " + conv.user.name;
  els.chatStatusDot.classList.toggle("online", conv.user.online);
  els.chatName.textContent = conv.user.name;
  els.chatPresence.textContent = conv.user.online ? "Online" : "Offline";
  els.chatPresence.classList.toggle("online", conv.user.online);
  els.chatItemChip.innerHTML = `<span class="item-chip">${itemIcon(conv.item.icon)} ${escapeHtml(conv.item.name)}</span>`;
 
  renderItemBanner(conv);
 
  realtimeSocket?.emit("chat:join", { conversation_id: id });

  // marca como lida
  if (conv.unreadCount > 0) {
    if (realtimeSocket?.connected) {
      realtimeSocket.emit("message:read", { conversation_id: id });
    } else {
      await API.markAsRead(id);
    }
    conv.unreadCount = 0;
    renderConversationList(currentFilteredList());
    document.querySelector(`.conv-item[data-id="${id}"]`)?.classList.add("active");
  }
 
  // Zera também a badge de mensagens não lidas no ícone do menu:
  // as notificações do tipo "mensagem" ligadas a essa conversa
  // (ver conversaId em onSendMessage) são marcadas como lidas aqui.
  // Sem isso, o número em cima do ícone de Mensagens nunca desceria
  // ao abrir a conversa — só a lista interna da página zerava.
  if (window.NotificacoesVizin) {
    NotificacoesVizin.obterTodas()
      .filter(n => n.tipo === "mensagem" && n.conversaId === id && !n.lida)
      .forEach(n => NotificacoesVizin.marcarComoLida(n.id));
  }
 
  els.typingIndicator.classList.add("hidden");
 
  state.messages = [];
  try {
    const history = await API.getMessages(id);
    if (state.activeConversationId !== id) return;
    const receivedWhileLoading = state.messages;
    state.messages = history;
    receivedWhileLoading.forEach(replaceOrAppendMessage);
    renderMessages(state.messages);
  } catch (err) {
    state.messages = [];
    els.messagesList.innerHTML = `<div class="messages-error">Não foi possível carregar as mensagens dessa conversa. <button type="button" id="retryMessagesBtn">Tentar novamente</button></div>`;
    document.getElementById("retryMessagesBtn")?.addEventListener("click", () => openConversation(id));
  }
 
  restoreDraft(id);
  ensureBackButton();
  abrirChatMobile();
}
 
/* ============================================================
   AVISO DE ANÚNCIO INDISPONÍVEL
   ============================================================ */
function renderItemBanner(conv) {
  const status = conv.item.status || "disponivel";
  if (status === "disponivel") {
    els.itemBanner.classList.add("hidden");
    return;
  }
  const texto = status === "alugado"
    ? "Este anúncio já foi alugado por outra pessoa. Combine com cuidado antes de seguir com a retirada."
    : "Este anúncio não está mais disponível.";
  els.itemBanner.textContent = texto;
  els.itemBanner.classList.remove("hidden");
}
 
/* ============================================================
   RASCUNHOS (salva o que a pessoa está digitando por conversa)
   ============================================================ */
function draftKey(convId) {
  return `vizin:draft:${convId}`;
}
 
function saveDraft(convId, text) {
  if (!convId) return;
  if (text) localStorage.setItem(draftKey(convId), text);
  else localStorage.removeItem(draftKey(convId));
}
 
function restoreDraft(convId) {
  const draft = localStorage.getItem(draftKey(convId)) || "";
  els.messageInput.value = draft;
  updateCharCounter();
  updateSendBtnState();
}
 
function clearDraft(convId) {
  localStorage.removeItem(draftKey(convId));
}
 
function currentFilteredList() {
  const q = els.searchInput.value.trim().toLowerCase();
  if (!q) return state.conversations;
  return state.conversations.filter(c =>
    c.user.name.toLowerCase().includes(q) || c.item.name.toLowerCase().includes(q)
  );
}
 
/* ============================================================
   NAVEGAÇÃO MOBILE (lista <-> chat, estilo WhatsApp/Instagram)
   ============================================================ */
 
// Desliza o painel de chat para a frente da lista e empilha um
// estado no histórico, para que o botão/gesto de voltar do celular
// feche o chat em vez de sair da página de Mensagens.
function abrirChatMobile() {
  if (!mobileQuery.matches) return;
 
  els.app.classList.add("is-chat-open");
 
  if (!history.state?.chatOpen) {
    history.pushState({ chatOpen: true }, "");
  }
}
 
// Fecha o chat e volta para a lista de conversas (mobile).
function fecharChatMobile() {
  els.app.classList.remove("is-chat-open");
}
 
// Botão de voltar do cabeçalho do chat (usado só em telas estreitas)
function ensureBackButton() {
  let btn = document.querySelector(".back-btn");
  if (btn) return;
 
  btn = document.createElement("button");
  btn.type = "button";
  btn.className = "back-btn";
  btn.setAttribute("aria-label", "Voltar para a lista de conversas");
  btn.innerHTML = '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 18l-6-6 6-6"/></svg>';
 
  btn.addEventListener("click", () => {
    // Se veio de um pushState nosso, deixa o popstate cuidar do resto
    // (assim o histórico do navegador fica consistente).
    if (history.state?.chatOpen) {
      history.back();
    } else {
      fecharChatMobile();
    }
  });
 
  document.querySelector(".chat-header").prepend(btn);
}
 
/* ============================================================
   MENSAGENS
   ============================================================ */
function renderMessages(messages) {
  els.messagesList.innerHTML = "";
  let lastDate = null;
 
  messages.forEach(msg => {
    const msgDate = new Date(msg.time).toDateString();
    if (msgDate !== lastDate) {
      const divider = document.createElement("div");
      divider.className = "msg-date-divider";
      divider.textContent = formatDateDivider(msg.time);
      els.messagesList.appendChild(divider);
      lastDate = msgDate;
    }
 
    const row = document.createElement("div");
    row.className = "msg-row " + msg.from;
 
    let inner = "";
    if (msg.type === "image" && msg.attachment) {
      inner += `<img class="msg-attachment" src="${escapeHtml(msg.attachment.url)}" alt="Imagem enviada">`;
    } else if (msg.type === "video" && msg.attachment) {
      inner += `<video class="msg-attachment" src="${escapeHtml(msg.attachment.url)}" controls playsinline></video>`;
    } else if (msg.type === "file" && msg.attachment) {
      inner += `<div class="msg-file">📎 ${escapeHtml(msg.attachment.name)}</div>`;
    }
    if (msg.text) {
      inner += `<div>${escapeHtml(msg.text)}</div>`;
    }
 
    const ticks = msg.from === "me" && msg.status !== "failed" ? renderTicks(msg.status) : "";
 
    row.className += msg.status === "failed" ? " failed" : "";
 
    row.innerHTML = `
      <div class="msg-bubble">
        ${inner}
        <div class="msg-meta">
          <span>${formatTime(msg.time)}</span>
          ${ticks}
        </div>
        ${msg.status === "failed" ? `
          <div class="msg-failed">
            <span>❗ Falha ao enviar</span>
            <button type="button" class="msg-failed__retry" data-retry-id="${msg.id}">Tentar de novo</button>
            <button type="button" class="msg-failed__discard" data-discard-id="${msg.id}">Apagar</button>
          </div>
        ` : ""}
      </div>
    `;
    els.messagesList.appendChild(row);
  });
 
  els.messagesList.querySelectorAll("[data-retry-id]").forEach(btn => {
    btn.addEventListener("click", () => retryFailedMessage(btn.dataset.retryId));
  });
  els.messagesList.querySelectorAll("[data-discard-id]").forEach(btn => {
    btn.addEventListener("click", () => discardFailedMessage(btn.dataset.discardId));
  });
 
  els.messagesList.scrollTop = els.messagesList.scrollHeight;
}
 
function renderTicks(status) {
  if (status === "sending") {
    return `<span class="ticks ticks--sending" title="Enviando...">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>
    </span>`;
  }
  const read = status === "read";
  return `<span class="ticks ${read ? "read" : ""}">
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M2 12l5 5L20 4"/><path d="M9 17l3 3L23 8" opacity="${read ? 1 : 0}"/></svg>
  </span>`;
}
 
/* ============================================================
   ENVIAR MENSAGEM
   ============================================================ */
function updateSendBtnState() {
  const hasText = els.messageInput.value.trim().length > 0;
  els.sendBtn.disabled = !hasText && !pendingAttachment;
}
 
function onMessageInputChange() {
  updateSendBtnState();
  updateCharCounter();
  saveDraft(state.activeConversationId, els.messageInput.value);
  updateTyping();
}

function updateTyping() {
  clearTimeout(typingStopTimer);
  if (!state.activeConversationId || !realtimeSocket?.connected || !els.messageInput.value.trim()) {
    stopTyping();
    return;
  }
  if (!typingSent) {
    realtimeSocket.emit("typing:start", { conversation_id: state.activeConversationId });
    typingSent = true;
  }
  typingStopTimer = setTimeout(stopTyping, 1500);
}

function stopTyping() {
  clearTimeout(typingStopTimer);
  if (typingSent && state.activeConversationId && realtimeSocket?.connected) {
    realtimeSocket.emit("typing:stop", { conversation_id: state.activeConversationId });
  }
  typingSent = false;
}
 
function updateCharCounter() {
  const len = els.messageInput.value.length;
  const remaining = MESSAGE_MAX_LENGTH - len;
  // Só mostra o contador quando a pessoa está perto do limite —
  // não precisa poluir a tela o tempo todo.
  if (remaining <= 200) {
    els.charCounter.textContent = `${remaining} caracteres restantes`;
    els.charCounter.classList.remove("hidden");
    els.charCounter.classList.toggle("char-counter--danger", remaining <= 0);
  } else {
    els.charCounter.classList.add("hidden");
  }
}
 
async function onSendMessage(e) {
  e.preventDefault();
  const id = state.activeConversationId;
  if (!id) return;
 
  const text = els.messageInput.value.trim();
  if (!text && !pendingAttachment) return;
 
  if (text.length > MESSAGE_MAX_LENGTH) {
    showToast(`Mensagem muito longa (máximo de ${MESSAGE_MAX_LENGTH} caracteres).`);
    return;
  }
 
  const attachment = pendingAttachment;
  els.messageInput.value = "";
  clearAttachment();
  updateSendBtnState();
  updateCharCounter();
  clearDraft(id);
 
  // Envio otimista: a bolha aparece na hora, com um relógio, e só vira
  // "enviada"/"falhou" quando a resposta do back-end chega. Isso evita
  // a sensação de trava enquanto a rede responde.
  stopTyping();
  const tempId = crypto.randomUUID();
  const optimisticMsg = {
    id: tempId,
    client_message_id: tempId,
    conversation_id: id,
    from: "me",
    type: attachment ? attachment.type : "text",
    text,
    attachment: attachment || null,
    time: new Date().toISOString(),
    status: "sending"
  };
  state.messages.push(optimisticMsg);
  renderMessages(state.messages);
 
  await trySendMessage(id, optimisticMsg, { text, attachment, clientMessageId: tempId });
}
 
async function trySendMessage(convId, optimisticMsg, payload) {
  if (realtimeSocket?.connected) {
    realtimeSocket.emit("message:send", {
      conversation_id: convId,
      content: payload.text || "",
      attachment_id: payload.attachment?.id || null,
      client_message_id: payload.clientMessageId
    });
    const timer = setTimeout(() => {
      pendingSendTimers.delete(payload.clientMessageId);
      // O mesmo client_message_id torna o fallback REST idempotente caso o ACK se perca.
      trySendMessageViaRest(convId, optimisticMsg, payload);
    }, 10000);
    pendingSendTimers.set(payload.clientMessageId, timer);
    return;
  }
  await trySendMessageViaRest(convId, optimisticMsg, payload);
}

async function trySendMessageViaRest(convId, optimisticMsg, payload) {
  try {
    const newMsg = await API.sendMessage(convId, payload);
    clearPendingSend(payload.clientMessageId);
    // substitui a mensagem otimista pela confirmada pelo back-end
    const idx = state.messages.findIndex(m => m.id === optimisticMsg.id);
    if (idx >= 0) state.messages[idx] = newMsg;
    if (state.activeConversationId === convId) renderMessages(state.messages);
 
    const conv = state.conversations.find(c => c.id === convId);
    if (conv) {
      conv.lastMessage = newMsg;
      renderConversationList(currentFilteredList());
      document.querySelector(`.conv-item[data-id="${convId}"]`)?.classList.add("active");
 
      // A notificação "Nova mensagem" para o destinatário é gerada pelo back-end.
    }
 
    // Status de entrega/leitura e "digitando..." vêm do back (polling ou WebSocket) — nada é simulado aqui.
  } catch (err) {
    // Falha no envio: mantém a bolha visível, marcada como "falhou",
    // com opção de reenviar ou apagar — igual WhatsApp/Telegram fazem.
    const msg = state.messages.find(m => m.id === optimisticMsg.id);
    if (msg) msg.status = "failed";
    if (state.activeConversationId === convId) renderMessages(state.messages);
  }
}
 
// Chamado pelo botão "Tentar novamente" de uma mensagem com falha.
function retryFailedMessage(msgId) {
  const convId = state.activeConversationId;
  const msg = state.messages.find(m => m.id === msgId);
  if (!msg) return;
  msg.status = "sending";
  renderMessages(state.messages);
  const clientMessageId = msg.client_message_id || msg.id || crypto.randomUUID();
  msg.client_message_id = clientMessageId;
  trySendMessage(convId, msg, { text: msg.text, attachment: msg.attachment, clientMessageId });
}
 
// Chamado pelo botão "Apagar" de uma mensagem com falha (nunca chegou
// a existir no back-end, então só precisa sumir da UI local).
function discardFailedMessage(msgId) {
  state.messages = state.messages.filter(m => m.id !== msgId);
  renderMessages(state.messages);
}
 
function updateMsgStatus(convId, msgId, status) {
  const msg = state.messages.find(m => m.id === msgId);
  if (msg) msg.status = status;
  if (state.activeConversationId === convId) renderMessages(state.messages);
}
 
/* ============================================================
   ANEXOS (arquivo/imagem)
   ============================================================ */
async function onFileSelected() {
  const file = els.fileInput.files[0];
  if (!file) return;
 
  showToast("Enviando anexo...");
  try {
    const uploaded = await API.uploadFile(file);
    pendingAttachment = uploaded;
 
    els.attachmentPreview.classList.remove("hidden");
    els.attachmentPreviewName.textContent = uploaded.name;
    els.attachmentPreviewImg.src = uploaded.type === "image" ? uploaded.url
      : uploaded.type === "video" ? "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24'%3E%3Ccircle cx='12' cy='12' r='11' fill='%238B90A0'/%3E%3Cpath d='M10 8.5v7l6-3.5-6-3.5Z' fill='%23fff'/%3E%3C/svg%3E"
      : "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24'%3E%3Cpath fill='%238B90A0' d='M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8l-6-6Z'/%3E%3C/svg%3E";
 
    updateSendBtnState();
  } catch (err) {
    // Cobre tanto arquivo inválido (tamanho/tipo, validado antes do
    // upload) quanto falha de rede durante o envio — em ambos os
    // casos não deixamos um anexo "fantasma" preso no composer.
    showToast(err.message || "Não foi possível enviar o arquivo.");
    clearAttachment();
  } finally {
    els.fileInput.value = "";
  }
}
 
function clearAttachment() {
  pendingAttachment = null;
  els.attachmentPreview.classList.add("hidden");
  els.attachmentPreviewImg.src = "";
  updateSendBtnState();
}
 
/* ============================================================
   BLOQUEAR / DENUNCIAR / APAGAR CONVERSA
   ============================================================ */
function activeConv() {
  return state.conversations.find(c => c.id === state.activeConversationId);
}
 
function onBlockUserClick() {
  const conv = activeConv();
  if (!conv) return;
  openModal({
    title: "Bloquear " + conv.user.name + "?",
    bodyHtml: `<p>Vocês não vão mais poder trocar mensagens, e essa conversa vai sumir da sua lista. Isso não avisa a pessoa de que ela foi bloqueada.</p>`,
    confirmLabel: "Bloquear",
    confirmDanger: true,
    onConfirm: async () => {
      try {
        await API.blockUser(conv.id);
        state.conversations = state.conversations.filter(c => c.id !== conv.id);
        renderConversationList(currentFilteredList());
        state.activeConversationId = null;
        els.chatActive.classList.add("hidden");
        els.chatEmpty.classList.remove("hidden");
        showToast(conv.user.name + " foi bloqueado(a).");
      } catch (err) {
        showToast("Não foi possível bloquear agora. Tente novamente.");
      }
    }
  });
}
 
// Mesma lista de motivos usada no formulário de Denúncia da página de
// Suporte (ver Suporte/suporte.js) — as duas telas alimentam a mesma
// fila de moderação, então usam o mesmo vocabulário de motivo.
const MOTIVOS_DENUNCIA = [
  { value: "comportamento", label: "Comportamento inadequado / assédio" },
  { value: "golpe", label: "Suspeita de golpe ou fraude" },
  { value: "item_danificado", label: "Item danificado ou não devolvido" },
  { value: "anuncio_falso", label: "Anúncio falso ou enganoso" },
  { value: "conteudo_impropprio", label: "Conteúdo impróprio" },
  { value: "pagamento", label: "Problema com pagamento ou reembolso" },
  { value: "outro", label: "Outro" }
];
 
function onReportConvClick() {
  const conv = activeConv();
  if (!conv) return;
  const opcoesMotivo = MOTIVOS_DENUNCIA
    .map(m => `<option value="${m.value}">${m.label}</option>`)
    .join("");
 
  openModal({
    title: "Denunciar conversa",
    bodyHtml: `
      <p class="modal-hint">Sua denúncia é analisada pela nossa equipe de suporte. Denúncias falsas podem resultar em suspensão da conta.</p>
      <p class="modal-hint">Em risco imediato? Ligue <strong>190</strong> (Polícia) — não espere a análise deste formulário.</p>
      <label class="modal-field-label" for="reportMotivo">Motivo</label>
      <select id="reportMotivo" class="modal-select">
        ${opcoesMotivo}
      </select>
      <label class="modal-field-label" for="reportMensagem">Detalhes</label>
      <textarea id="reportMensagem" class="modal-textarea" placeholder="Descreva o que aconteceu..."></textarea>
    `,
    confirmLabel: "Enviar denúncia",
    confirmDanger: true,
    onConfirm: async () => {
      const motivo = document.getElementById("reportMotivo").value;
      const mensagem = document.getElementById("reportMensagem").value.trim();
      if (!mensagem) {
        showToast("Descreva o que aconteceu antes de enviar.");
        return false; // impede o modal de fechar
      }
      try {
        const report = await API.reportConversation(conv.id, { motivo, mensagem });
        // Protocolo curto pra pessoa guardar/referenciar depois — no
        // back-end real isso já viria pronto na resposta do POST.
        const protocolo = String(report?.id || "").slice(-8).toUpperCase();
        showToast(protocolo ? `Denúncia enviada. Protocolo #${protocolo}` : "Denúncia enviada. Nossa equipe vai analisar.");
        // Denunciar e bloquear costumam andar juntos — oferece na
        // sequência em vez de depender da pessoa lembrar de bloquear
        // manualmente depois pelo menu "⋮".
        setTimeout(() => promptBloquearAposDenuncia(conv), 350);
      } catch (err) {
        showToast("Não foi possível enviar a denúncia agora. Tente novamente.");
        return false;
      }
    }
  });
}
 
function promptBloquearAposDenuncia(conv) {
  // A conversa pode já ter sumido da lista (ex: usuário trocou de aba
  // rapidamente) — nesse caso não faz sentido oferecer bloqueio dela.
  if (!state.conversations.some(c => c.id === conv.id)) return;
 
  openModal({
    title: "Bloquear " + conv.user.name + " também?",
    bodyHtml: `<p>Assim ${escapeHtml(conv.user.name)} não consegue mais te mandar mensagem enquanto a denúncia é analisada.</p>`,
    confirmLabel: "Bloquear",
    cancelLabel: "Agora não",
    confirmDanger: true,
    onConfirm: async () => {
      try {
        await API.blockUser(conv.id);
        state.conversations = state.conversations.filter(c => c.id !== conv.id);
        renderConversationList(currentFilteredList());
        if (state.activeConversationId === conv.id) {
          state.activeConversationId = null;
          els.chatActive.classList.add("hidden");
          els.chatEmpty.classList.remove("hidden");
        }
        showToast(conv.user.name + " foi bloqueado(a).");
      } catch (err) {
        showToast("Não foi possível bloquear agora. Tente novamente.");
      }
    }
  });
}
 
function onDeleteConvClick() {
  const conv = activeConv();
  if (!conv) return;
  openModal({
    title: "Apagar esta conversa?",
    bodyHtml: `<p>Ela some só da sua lista — ${escapeHtml(conv.user.name)} continua vendo o histórico normalmente.</p>`,
    confirmLabel: "Apagar",
    confirmDanger: true,
    onConfirm: async () => {
      try {
        await API.deleteConversationForMe(conv.id);
        state.conversations = state.conversations.filter(c => c.id !== conv.id);
        renderConversationList(currentFilteredList());
        state.activeConversationId = null;
        els.chatActive.classList.add("hidden");
        els.chatEmpty.classList.remove("hidden");
        showToast("Conversa apagada.");
      } catch (err) {
        showToast("Não foi possível apagar agora. Tente novamente.");
      }
    }
  });
}
 
/* ============================================================
   USUÁRIOS BLOQUEADOS
   ============================================================ */
async function onBlockedUsersClick() {
  let blocked;
  try {
    blocked = await API.getBlockedUsers();
  } catch (err) {
    showToast("Não foi possível carregar os usuários bloqueados.");
    return;
  }
  openModal({
    title: "Usuários bloqueados",
    bodyHtml: blockedUsersListHtml(blocked),
    hideConfirm: true,
    cancelLabel: "Fechar"
  });
  bindBlockedUsersListEvents();
}
 
function blockedUsersListHtml(blocked) {
  if (blocked.length === 0) {
    return `<p>Você não tem usuários bloqueados.</p>`;
  }
  return `<ul class="blocked-users-list">${blocked.map(u => `
    <li class="blocked-user-item" data-user-id="${escapeHtml(u.id)}">
      <img class="blocked-user-avatar" src="${escapeHtml(u.avatar || "")}" alt="Foto de ${escapeHtml(u.name)}">
      <span class="blocked-user-name">${escapeHtml(u.name)}</span>
      <button type="button" class="blocked-user-unblock">Desbloquear</button>
    </li>
  `).join("")}</ul>`;
}
 
// Cada item da lista tem sua própria ação (desbloquear), então em vez
// de usar o onConfirm único do modal genérico, escuta os cliques nos
// botões renderizados dentro do modal-body.
function bindBlockedUsersListEvents() {
  els.modalBody.querySelectorAll(".blocked-user-unblock").forEach(btn => {
    btn.addEventListener("click", async () => {
      const li = btn.closest(".blocked-user-item");
      const userId = li.dataset.userId;
      btn.disabled = true;
      btn.textContent = "Desbloqueando...";
      try {
        await API.unblockUser(userId);
        li.remove();
        showToast("Usuário desbloqueado.");
        // A conversa volta a existir na lista principal agora que o
        // usuário não está mais bloqueado.
        state.conversations = await API.getConversations();
        renderConversationList(currentFilteredList());
        if (!els.modalBody.querySelector(".blocked-user-item")) {
          els.modalBody.innerHTML = "<p>Você não tem usuários bloqueados.</p>";
        }
      } catch (err) {
        showToast("Não foi possível desbloquear agora. Tente novamente.");
        btn.disabled = false;
        btn.textContent = "Desbloquear";
      }
    });
  });
}
 
/* ============================================================
   MODAL GENÉRICO (confirmação, formulário de denúncia e listas
   com ação própria por item, como usuários bloqueados)
   ============================================================ */
let modalOnConfirm = null;
 
function openModal({ title, bodyHtml, confirmLabel, confirmDanger, onConfirm, hideConfirm, cancelLabel }) {
  els.modalTitle.textContent = title;
  els.modalBody.innerHTML = bodyHtml;
  els.modalConfirmBtn.textContent = confirmLabel || "Confirmar";
  els.modalConfirmBtn.classList.toggle("danger", !!confirmDanger);
  els.modalConfirmBtn.classList.toggle("hidden", !!hideConfirm);
  els.modalConfirmBtn.disabled = false;
  els.modalCancelBtn.textContent = cancelLabel || "Cancelar";
  modalOnConfirm = onConfirm || null;
  els.modalOverlay.classList.remove("hidden");
}
 
function closeModal() {
  els.modalOverlay.classList.add("hidden");
  els.modalBody.innerHTML = "";
  els.modalConfirmBtn.classList.remove("hidden");
  modalOnConfirm = null;
}
 
/* ============================================================
   TOAST
   ============================================================ */
let toastTimer = null;
function showToast(msg) {
  els.toaste.textContent = msg;
  els.toaste.classList.remove("hidden");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => els.toaste.classList.add("hidden"), 2200);
}
 
/* ============================================================
   HELPERS
   ============================================================ */
function escapeHtml(str = "") {
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}
 
function formatTime(iso) {
  const d = new Date(iso);
  return d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
}
 
function formatRelativeTime(iso) {
  const diffMs = Date.now() - new Date(iso).getTime();
  const min = Math.floor(diffMs / 60000);
  if (min < 1) return "agora";
  if (min < 60) return `${min} min`;
  const hours = Math.floor(min / 60);
  if (hours < 24) return `${hours} ${hours === 1 ? "hora" : "horas"}`;
  const days = Math.floor(hours / 24);
  return `${days} ${days === 1 ? "dia" : "dias"}`;
}
 
function formatDateDivider(iso) {
  const d = new Date(iso);
  const today = new Date();
  const isToday = d.toDateString() === today.toDateString();
  if (isToday) return "Hoje";
  return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "long" });
}
 
/* ============================================================ */
init();
