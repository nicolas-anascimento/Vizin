/**
 * api.js
 * ------------------------------------------------------------------
 * Camada de acesso a dados da página de Mensagens.
 *
 * HOJE: cada função lê/escreve em MOCK_CONVERSATIONS (memória).
 * DEPOIS: troque o corpo de cada função por um fetch() real,
 * mantendo a MESMA ASSINATURA (parâmetros e retorno), assim o
 * resto do app (app.js) não precisa mudar nada.
 *
 * Sugestão de contrato de API para o back-end:
 *
 *   GET    /api/conversations
 *          -> [{ id, user:{id,name,avatar,online}, item:{name,icon,produtoId},
 *                unreadCount, lastMessage:{text,time} }]
 *
 *   GET    /api/conversations/:id/messages
 *          -> [{ id, from, type, text, time, status, attachment }]
 *
 *   POST   /api/conversations/:id/messages
 *          body: { text, attachmentId? }
 *          -> { id, from, type, text, time, status }
 *
 *   POST   /api/conversations/:id/read
 *          -> marca a conversa como lida (zera unreadCount)
 *
 *   POST   /api/uploads   (multipart/form-data, campo "file")
 *          -> { id, url, name, mimeType }
 *
 *   POST   /api/conversations
 *          body: { userId, produtoId, produtoTitulo, itemIcon }
 *          -> retorna a conversa existente com esse usuário/produto,
 *             ou cria uma nova caso ainda não exista.
 *          IMPORTANTE: mesmo quando já existir uma conversa, o
 *          back-end deve atualizar item.name/item.icon com os dados
 *          atuais do anúncio (ver getOrCreateConversation abaixo) —
 *          caso contrário o chip do chat mostra um nome desatualizado
 *          se o título do produto tiver mudado desde a última vez.
 *
 *   POST   /api/conversations/:id/block
 *          -> bloqueia o autor da conversa; ele deixa de conseguir
 *             enviar novas mensagens e a conversa some da sua lista.
 *
 *   POST   /api/users/:userId/unblock
 *          -> remove o bloqueio.
 *
 *   POST   /api/conversations/:id/report
 *          body: { motivo, mensagem }
 *          -> abre uma denúncia sobre a conversa/usuário para o time
 *             de suporte analisar (mesmo fluxo da página de Suporte).
 *
 *   DELETE /api/conversations/:id
 *          -> remove a conversa só da lista de quem chamou (soft
 *             delete do lado do usuário; o outro participante continua
 *             vendo a conversa normalmente).
 *
 *   Autenticação: assumindo Bearer token no header Authorization.
 *   Tempo real (opcional): WebSocket em /ws/conversations para
 *   receber novas mensagens e status de "digitando..." sem polling.
 * ------------------------------------------------------------------
 */
 
const API = (() => {
 
  // Simula latência de rede para o mock ficar realista
  const delay = (ms = 250) => new Promise(res => setTimeout(res, ms));
 
  /* ----------------------------------------------------------------
     MODO DE TESTE DE FALHAS
     ----------------------------------------------------------------
     Com SIMULATE_ERROR_RATE > 0, uma fração das chamadas ao "back-end"
     mock rejeita de propósito — assim dá pra testar os estados de erro
     da tela (banner de "não foi possível carregar", mensagem "falha ao
     enviar" etc.) sem precisar de um back-end real fora do ar.
     Deixe em 0 para o comportamento normal (sempre com sucesso).
     ---------------------------------------------------------------- */
  const SIMULATE_ERROR_RATE = 0;
  function maybeFail(context) {
    if (SIMULATE_ERROR_RATE > 0 && Math.random() < SIMULATE_ERROR_RATE) {
      throw new Error(`Falha simulada em ${context}`);
    }
  }
 
  async function getConversations() {
    await delay();
    maybeFail("getConversations");
    // TODO (back-end real):
    // const res = await fetch('/api/conversations', { headers: authHeaders() });
    // if (!res.ok) throw new Error('Falha ao carregar conversas.');
    // return res.json();
    return MOCK_CONVERSATIONS
      .filter(c => !c.hiddenForMe && !MOCK_BLOCKED_USERS.includes(c.user.id))
      .map(c => ({
        id: c.id,
        user: c.user,
        item: c.item,
        unreadCount: c.unreadCount,
        lastMessage: c.messages[c.messages.length - 1]
      }));
  }
 
  async function getMessages(conversationId) {
    await delay(150);
    maybeFail("getMessages");
    // TODO (back-end real):
    // const res = await fetch(`/api/conversations/${conversationId}/messages`, { headers: authHeaders() });
    // if (!res.ok) throw new Error('Falha ao carregar mensagens.');
    // return res.json();
    const conv = MOCK_CONVERSATIONS.find(c => c.id === conversationId);
    // Retorna uma CÓPIA do array (não a referência), assim como uma
    // resposta HTTP real faria — evita que inserções feitas depois
    // (ex: sendMessage) dupliquem itens no state.messages do app.js.
    return conv ? [...conv.messages] : [];
  }
 
  async function sendMessage(conversationId, { text, attachment }) {
    await delay(200);
    maybeFail("sendMessage");
    // TODO (back-end real):
    // const res = await fetch(`/api/conversations/${conversationId}/messages`, {
    //   method: 'POST',
    //   headers: { ...authHeaders(), 'Content-Type': 'application/json' },
    //   body: JSON.stringify({ text, attachmentId: attachment?.id })
    // });
    // if (!res.ok) throw new Error('Falha ao enviar mensagem.');
    // return res.json();
    const conv = MOCK_CONVERSATIONS.find(c => c.id === conversationId);
    const newMsg = {
      id: "m" + Date.now(),
      from: "me",
      type: attachment ? attachment.type : "text",
      text: text || "",
      attachment: attachment || null,
      time: new Date().toISOString(),
      status: "sent"
    };
    if (conv) conv.messages.push(newMsg);
    return newMsg;
  }
 
  async function markAsRead(conversationId) {
    await delay(100);
    // TODO (back-end real):
    // await fetch(`/api/conversations/${conversationId}/read`, { method: 'POST', headers: authHeaders() });
    const conv = MOCK_CONVERSATIONS.find(c => c.id === conversationId);
    if (conv) conv.unreadCount = 0;
  }
 
  // Regras de validação de anexo. Front-end valida por UX (feedback
  // imediato); o back-end real PRECISA validar de novo — nunca confie
  // só no que o navegador manda.
  const MAX_FILE_SIZE_MB = 25;
  const ALLOWED_FILE_PREFIXES = ["image/", "video/"];
  const ALLOWED_FILE_TYPES = [
    "application/pdf",
    "application/msword",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
  ];
 
  function validateFile(file) {
    const sizeMb = file.size / (1024 * 1024);
    if (sizeMb > MAX_FILE_SIZE_MB) {
      return { ok: false, reason: `Arquivo muito grande. O limite é ${MAX_FILE_SIZE_MB}MB.` };
    }
    const typeOk = ALLOWED_FILE_PREFIXES.some(p => file.type.startsWith(p)) ||
      ALLOWED_FILE_TYPES.includes(file.type);
    if (!typeOk) {
      return { ok: false, reason: "Tipo de arquivo não suportado." };
    }
    return { ok: true };
  }
 
  async function uploadFile(file) {
    const check = validateFile(file);
    if (!check.ok) throw new Error(check.reason);
 
    await delay(300);
    maybeFail("uploadFile");
    // TODO (back-end real):
    // const form = new FormData();
    // form.append('file', file);
    // const res = await fetch('/api/uploads', { method: 'POST', headers: authHeaders(), body: form });
    // if (!res.ok) throw new Error('Falha ao enviar anexo.');
    // return res.json(); // { id, url, name, mimeType }
    return {
      id: "f" + Date.now(),
      url: URL.createObjectURL(file), // no back-end real isso vem pronto do servidor
      name: file.name,
      mimeType: file.type,
      type: file.type.startsWith("image/") ? "image"
        : file.type.startsWith("video/") ? "video"
        : "file"
    };
  }
 
  // Busca uma conversa existente com esse usuário sobre esse produto;
  // se não existir, cria uma nova. Usado quando alguém chega em
  // Mensagens vindo do botão "Conversar" da página do objeto.
  async function getOrCreateConversation({ userId, userName, produtoId, produtoTitulo, itemIcon = "tool" }) {
    await delay(150);
    // TODO (back-end real):
    // const res = await fetch('/api/conversations', {
    //   method: 'POST',
    //   headers: { ...authHeaders(), 'Content-Type': 'application/json' },
    //   body: JSON.stringify({ userId, produtoId, produtoTitulo, itemIcon })
    // });
    // return res.json();
 
    // Quando vem com produtoId (ex: botão "Conversar" da página do
    // Produto), a conversa é específica daquele anúncio: usuário +
    // produto precisam bater os dois.
    // Quando vem SEM produtoId (ex: botão "Conversar" do Perfil, que não
    // tem um objeto associado), reaproveita QUALQUER conversa já existente
    // com esse usuário — senão, cada clique nesse botão criaria uma
    // conversa nova e duplicada, já que nenhuma teria produtoId === undefined
    // batendo com a anterior (cada uma teria vindo de um Date.now() diferente).
    let conv = produtoId
      ? MOCK_CONVERSATIONS.find(c => c.user.id === userId && c.item?.produtoId === produtoId)
      : MOCK_CONVERSATIONS.find(c => c.user.id === userId);
 
    if (conv) {
      // CORREÇÃO: mesmo quando a conversa já existe (ex: já tinha
      // trocado mensagens antes sobre esse mesmo objeto), sincroniza
      // o nome/ícone do item com o que veio da página do produto
      // agora. Sem isso, o chip do chat (#chatItemChip) ficava preso
      // ao título antigo salvo no mock/back-end, mesmo que o anúncio
      // tivesse outro nome no momento do clique em "Conversar".
      if (produtoTitulo) conv.item.name = produtoTitulo;
      if (itemIcon) conv.item.icon = itemIcon;
      return conv;
    }
 
    conv = {
      id: "c" + Date.now(),
      user: {
        id: userId,
        name: userName || "Usuário",
        avatar: `https://i.pravatar.cc/150?u=${encodeURIComponent(userId)}`,
        online: false
      },
      item: { name: produtoTitulo || "Conversa geral", icon: itemIcon, produtoId },
      unreadCount: 0,
      messages: []
    };
    MOCK_CONVERSATIONS.unshift(conv);
    return conv;
  }
 
  // Bloqueia o autor de uma conversa: ele some da lista e não pode
  // mais mandar mensagem (a conversa continua existindo pro outro lado,
  // só não aparece mais aqui).
  async function blockUser(userId) {
    await delay(200);
    maybeFail("blockUser");
    // TODO (back-end real):
    // const res = await fetch(`/api/users/${userId}/block`, { method: 'POST', headers: authHeaders() });
    // if (!res.ok) throw new Error('Falha ao bloquear usuário.');
    if (!MOCK_BLOCKED_USERS.includes(userId)) MOCK_BLOCKED_USERS.push(userId);
  }
 
  async function unblockUser(userId) {
    await delay(200);
    // TODO (back-end real): POST /api/users/:userId/unblock
    const idx = MOCK_BLOCKED_USERS.indexOf(userId);
    if (idx >= 0) MOCK_BLOCKED_USERS.splice(idx, 1);
  }
 
  function isUserBlocked(userId) {
    return MOCK_BLOCKED_USERS.includes(userId);
  }
 
  // Lista os usuários bloqueados pelo usuário atual, já com nome/avatar
  // pra exibir na tela de "Usuários bloqueados" (a página de bloqueio
  // não guarda esses dados separadamente, então busca na conversa
  // correspondente — ela continua existindo em MOCK_CONVERSATIONS
  // mesmo depois do bloqueio, só não aparece mais em getConversations).
  async function getBlockedUsers() {
    await delay(150);
    maybeFail("getBlockedUsers");
    // TODO (back-end real):
    // const res = await fetch('/api/blocked-users', { headers: authHeaders() });
    // if (!res.ok) throw new Error('Falha ao carregar usuários bloqueados.');
    // return res.json(); // [{ id, name, avatar }]
    return MOCK_BLOCKED_USERS.map(userId => {
      const conv = MOCK_CONVERSATIONS.find(c => c.user.id === userId);
      return conv
        ? { id: userId, name: conv.user.name, avatar: conv.user.avatar }
        : { id: userId, name: userId, avatar: null };
    });
  }
 
  // Envia uma denúncia sobre a conversa/usuário para o time de suporte
  // analisar (mesmo conceito do formulário de Denúncia da página de
  // Suporte, só que já vem com o contexto da conversa preenchido).
  async function reportConversation(conversationId, { motivo, mensagem }) {
    await delay(300);
    maybeFail("reportConversation");
    // TODO (back-end real):
    // const res = await fetch(`/api/conversations/${conversationId}/report`, {
    //   method: 'POST',
    //   headers: { ...authHeaders(), 'Content-Type': 'application/json' },
    //   body: JSON.stringify({ motivo, mensagem })
    // });
    // if (!res.ok) throw new Error('Falha ao enviar denúncia.');
    // return res.json();
    const conv = MOCK_CONVERSATIONS.find(c => c.id === conversationId);
    const report = {
      id: "r" + Date.now(),
      conversationId,
      contra: conv?.user?.id || null,
      motivo,
      mensagem,
      data: new Date().toISOString()
    };
    MOCK_REPORTS.push(report);
    return report;
  }
 
  // Remove a conversa só da lista de quem chamou (soft delete).
  async function deleteConversationForMe(conversationId) {
    await delay(200);
    maybeFail("deleteConversationForMe");
    // TODO (back-end real): DELETE /api/conversations/:id
    const conv = MOCK_CONVERSATIONS.find(c => c.id === conversationId);
    if (conv) conv.hiddenForMe = true;
  }
 
  function authHeaders() {
    // Ex.: return { Authorization: `Bearer ${localStorage.getItem('token')}` };
    return {};
  }
 
  return {
    getConversations,
    getMessages,
    sendMessage,
    markAsRead,
    uploadFile,
    getOrCreateConversation,
    blockUser,
    unblockUser,
    isUserBlocked,
    getBlockedUsers,
    reportConversation,
    deleteConversationForMe
  };
})();