// Cliente de conversas. IDs de usuários, conversas e anexos permanecem strings.
const API = (() => {
  const api = window.ApiVizin;
  const enc = encodeURIComponent;
  if (!api) throw new Error("Carregue api-client.js antes de Mensagens/api.js");

  async function all(caminho) {
    return api.listarTodas(caminho);
  }

  async function privateMessage(message) {
    if (!message?.attachment?.url) return message;
    try {
      return { ...message, attachment: { ...message.attachment,
        url: await api.urlBlob(message.attachment.url) } };
    } catch {
      return message;
    }
  }

  return {
    getConversations: () => all("/conversations"),
    getOrCreateConversation: ({ userId, produtoId }) => api.post("/conversations", {
      userId: String(userId), ...(produtoId ? { produtoId: String(produtoId) } : {})
    }),
    async getMessages(id) {
      const messages = [];
      let before;
      for (;;) {
        const query = new URLSearchParams({ limit: "100" });
        if (before) query.set("before", before);
        const batch = await api.get(`/conversations/${enc(id)}/messages?${query}`);
        if (!Array.isArray(batch)) throw new Error("Resposta de mensagens inválida");
        messages.unshift(...batch);
        if (batch.length < 100) break;
        before = batch[0]?.id;
        if (!before) break;
      }
      return Promise.all(messages.map(privateMessage));
    },
    async sendMessage(id, { text, attachment, clientMessageId }) {
      const sent = await api.post(`/conversations/${enc(id)}/messages`, {
        text: text || "",
        ...(attachment?.id ? { attachmentId: String(attachment.id) } : {}),
        ...(clientMessageId ? { client_message_id: String(clientMessageId) } : {})
      });
      return privateMessage(sent);
    },
    normalizeMessage: privateMessage,
    markAsRead: id => api.post(`/conversations/${enc(id)}/read`, {}),
    blockUser: conversationId => api.post(`/conversations/${enc(conversationId)}/block`, {}),
    reportConversation: (id, body) => api.post(`/conversations/${enc(id)}/report`, body),
    deleteConversationForMe: id => api.delete(`/conversations/${enc(id)}`),
    getBlockedUsers: () => api.get("/blocked-users"),
    unblockUser: id => api.post(`/users/${enc(id)}/unblock`, {}),
    async uploadFile(file) {
      const form = new FormData();
      form.append("file", file);
      const uploaded = await api.post("/uploads", form);
      return { ...uploaded, url: await api.urlBlob(uploaded.url) };
    }
  };
})();
