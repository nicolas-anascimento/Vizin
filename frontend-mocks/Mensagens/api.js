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
 *   Autenticação: assumindo Bearer token no header Authorization.
 *   Tempo real (opcional): WebSocket em /ws/conversations para
 *   receber novas mensagens e status de "digitando..." sem polling.
 *
 *   Chamadas de voz/vídeo: ver chamada.js — hoje simuladas via
 *   BroadcastChannel (só entre abas do mesmo navegador), com um
 *   bloco isolado marcado para troca por WebSocket de sinalização
 *   real quando o back-end estiver pronto.
 * ------------------------------------------------------------------
 */
 
const API = (() => {
 
  // Simula latência de rede para o mock ficar realista
  const delay = (ms = 250) => new Promise(res => setTimeout(res, ms));
 
  async function getConversations() {
    await delay();
    // TODO (back-end real):
    // const res = await fetch('/api/conversations', { headers: authHeaders() });
    // return res.json();
    return MOCK_CONVERSATIONS.map(c => ({
      id: c.id,
      user: c.user,
      item: c.item,
      unreadCount: c.unreadCount,
      lastMessage: c.messages[c.messages.length - 1]
    }));
  }
 
  async function getMessages(conversationId) {
    await delay(150);
    // TODO (back-end real):
    // const res = await fetch(`/api/conversations/${conversationId}/messages`, { headers: authHeaders() });
    // return res.json();
    const conv = MOCK_CONVERSATIONS.find(c => c.id === conversationId);
    // Retorna uma CÓPIA do array (não a referência), assim como uma
    // resposta HTTP real faria — evita que inserções feitas depois
    // (ex: sendMessage) dupliquem itens no state.messages do app.js.
    return conv ? [...conv.messages] : [];
  }
 
  async function sendMessage(conversationId, { text, attachment }) {
    await delay(200);
    // TODO (back-end real):
    // const res = await fetch(`/api/conversations/${conversationId}/messages`, {
    //   method: 'POST',
    //   headers: { ...authHeaders(), 'Content-Type': 'application/json' },
    //   body: JSON.stringify({ text, attachmentId: attachment?.id })
    // });
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
 
  async function uploadFile(file) {
    await delay(300);
    // TODO (back-end real):
    // const form = new FormData();
    // form.append('file', file);
    // const res = await fetch('/api/uploads', { method: 'POST', headers: authHeaders(), body: form });
    // return res.json(); // { id, url, name, mimeType }
    return {
      id: "f" + Date.now(),
      url: URL.createObjectURL(file), // no back-end real isso vem pronto do servidor
      name: file.name,
      mimeType: file.type,
      type: file.type.startsWith("image/") ? "image" : "file"
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
 
    let conv = MOCK_CONVERSATIONS.find(c =>
      c.user.id === userId && c.item?.produtoId === produtoId
    );
 
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
      item: { name: produtoTitulo || "Item", icon: itemIcon, produtoId },
      unreadCount: 0,
      messages: []
    };
    MOCK_CONVERSATIONS.unshift(conv);
    return conv;
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
    getOrCreateConversation
  };
})();