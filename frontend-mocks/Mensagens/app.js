/**
 * app.js
 * ------------------------------------------------------------------
 * Toda a lógica de interface da página de Mensagens.
 * Não conhece de onde os dados vêm — fala só com API (api.js).
 * ------------------------------------------------------------------
 */
 
const usuarioLogado = JSON.parse(localStorage.getItem("usuario") || "null");
 
const state = {
  conversations: [],
  activeConversationId: null,
  messages: [],           // mensagens da conversa aberta
};
 
const els = {
  app: document.querySelector(".app"),
  convList: document.getElementById("convList"),
  convEmpty: document.getElementById("convEmpty"),
  searchInput: document.getElementById("searchInput"),
 
  chatEmpty: document.getElementById("chatEmpty"),
  chatActive: document.getElementById("chatActive"),
  chatAvatar: document.getElementById("chatAvatar"),
  chatStatusDot: document.getElementById("chatStatusDot"),
  chatName: document.getElementById("chatName"),
  chatPresence: document.getElementById("chatPresence"),
  chatItemChip: document.getElementById("chatItemChip"),
 
  messagesList: document.getElementById("messagesList"),
  typingIndicator: document.getElementById("typingIndicator"),
 
  composerForm: document.getElementById("composerForm"),
  messageInput: document.getElementById("messageInput"),
  sendBtn: document.getElementById("sendBtn"),
 
  attachBtn: document.getElementById("attachBtn"),
  fileInput: document.getElementById("fileInput"),
  attachmentPreview: document.getElementById("attachmentPreview"),
  attachmentPreviewImg: document.getElementById("attachmentPreviewImg"),
  attachmentPreviewName: document.getElementById("attachmentPreviewName"),
  attachmentRemoveBtn: document.getElementById("attachmentRemoveBtn"),
 
  toast: document.getElementById("toaste"),
};
 
let pendingAttachment = null;
 
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
  state.conversations = await API.getConversations();
  renderConversationList(state.conversations);
  bindEvents();
  await abrirConversaViaQueryParams();
}
 
// Se a página foi aberta a partir do botão "Conversar" da página do
// objeto (com ?userId=...&produtoId=...), abre a conversa certa —
// criando uma nova se ainda não existir.
async function abrirConversaViaQueryParams() {
  const params = new URLSearchParams(window.location.search);
  const userId = params.get("userId");
  if (!userId) return;
 
  const userName = params.get("userName");
  const produtoId = params.get("produtoId");
  const produtoTitulo = params.get("produtoTitulo");
 
  const conv = await API.getOrCreateConversation({
    userId,
    userName,
    produtoId,
    produtoTitulo
  });
 
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
  els.composerForm.addEventListener("submit", onSendMessage);
  els.messageInput.addEventListener("input", updateSendBtnState);
  els.attachBtn.addEventListener("click", () => els.fileInput.click());
  els.fileInput.addEventListener("change", onFileSelected);
  els.attachmentRemoveBtn.addEventListener("click", clearAttachment);
 
  // Clicar na foto do usuário no cabeçalho do chat ativo leva ao perfil dele
  els.chatAvatar.addEventListener("click", () => {
    const conv = state.conversations.find(c => c.id === state.activeConversationId);
    if (conv?.user?.id) {
      window.location.href = `../Perfil/index.html?id=${conv.user.id}`;
    }
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
        <img src="${conv.user.avatar}" alt="Foto de ${conv.user.name}">
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
 
  // marca como lida
  if (conv.unreadCount > 0) {
    await API.markAsRead(id);
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
 
  state.messages = await API.getMessages(id);
  renderMessages(state.messages);
 
  ensureBackButton();
  abrirChatMobile();
 
  // Entra na "sala" de sinalização de chamadas dessa conversa —
  // necessário tanto pra ligar quanto pra RECEBER chamadas nela.
  if (window.joinCallRoom) joinCallRoom(id);
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
      inner += `<img class="msg-attachment" src="${msg.attachment.url}" alt="Imagem enviada">`;
    } else if (msg.type === "file" && msg.attachment) {
      inner += `<div class="msg-file">📎 ${escapeHtml(msg.attachment.name)}</div>`;
    }
    if (msg.text) {
      inner += `<div>${escapeHtml(msg.text)}</div>`;
    }
 
    const ticks = msg.from === "me" ? renderTicks(msg.status) : "";
 
    row.innerHTML = `
      <div class="msg-bubble">
        ${inner}
        <div class="msg-meta">
          <span>${formatTime(msg.time)}</span>
          ${ticks}
        </div>
      </div>
    `;
    els.messagesList.appendChild(row);
  });
 
  els.messagesList.scrollTop = els.messagesList.scrollHeight;
}
 
function renderTicks(status) {
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
 
async function onSendMessage(e) {
  e.preventDefault();
  const id = state.activeConversationId;
  if (!id) return;
 
  const text = els.messageInput.value.trim();
  if (!text && !pendingAttachment) return;
 
  const newMsg = await API.sendMessage(id, { text, attachment: pendingAttachment });
 
  state.messages.push(newMsg);
  renderMessages(state.messages);
 
  // atualiza preview na lista lateral
  const conv = state.conversations.find(c => c.id === id);
  if (conv) {
    conv.lastMessage = newMsg;
    renderConversationList(currentFilteredList());
    document.querySelector(`.conv-item[data-id="${id}"]`)?.classList.add("active");
 
    // ===== Notifica o destinatário =====
    if (window.NotificacoesVizin) {
      window.NotificacoesVizin.adicionarNotificacao(
        {
          tipo: "mensagem",
          titulo: "Nova mensagem",
          descricao: `${usuarioLogado?.nome || "Alguém"} enviou uma mensagem sobre "${conv.item.name}".`,
          data: new Date().toLocaleDateString("pt-BR"),
          conversaId: id
        },
        conv.user.id
      );
    }
  }
 
  els.messageInput.value = "";
  clearAttachment();
  updateSendBtnState();
 
  simulateReplyStatusUpdate(id, newMsg.id);
}
 
// Simula, no mock, a mensagem sendo "entregue" e depois "lida" pelo outro lado.
// TODO (back-end real): isso deve vir de um evento via WebSocket/polling,
// não de um setTimeout no front-end.
function simulateReplyStatusUpdate(convId, msgId) {
  setTimeout(() => updateMsgStatus(convId, msgId, "delivered"), 800);
  setTimeout(() => updateMsgStatus(convId, msgId, "read"), 2200);
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
  const uploaded = await API.uploadFile(file);
  pendingAttachment = uploaded;
 
  els.attachmentPreview.classList.remove("hidden");
  els.attachmentPreviewName.textContent = uploaded.name;
  els.attachmentPreviewImg.src = uploaded.type === "image" ? uploaded.url
    : "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24'%3E%3Cpath fill='%238B90A0' d='M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8l-6-6Z'/%3E%3C/svg%3E";
 
  updateSendBtnState();
  els.fileInput.value = "";
}
 
function clearAttachment() {
  pendingAttachment = null;
  els.attachmentPreview.classList.add("hidden");
  els.attachmentPreviewImg.src = "";
  updateSendBtnState();
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
 