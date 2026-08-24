/**
 * mock-data.js
 * ------------------------------------------------------------------
 * Dados fictícios usados enquanto o back-end não está disponível.
 * A estrutura aqui foi pensada para refletir o formato que a API
 * deve retornar (ver comentários em api.js com a sugestão de rotas).
 *
 * IMPORTANTE: user.id usa o mesmo formato de e-mail que o resto do
 * sistema (produto.js, notificacoes-shared.js), pois é o identificador
 * usado como chave de notificações e de solicitações de aluguel.
 *
 * Quando o back-end estiver pronto, este arquivo pode ser removido
 * — basta que api.js passe a chamar fetch() de verdade.
 * ------------------------------------------------------------------
 */

const CURRENT_USER = {
  id: "u-me",
  name: "Você"
};

const MOCK_CONVERSATIONS = [
  {
    id: "c1",
    user: {
      id: "maria@vizin.com",
      name: "Maria Silva",
      avatar: "https://i.pravatar.cc/150?img=47",
      online: true
    },
    item: { name: "Furadeira", icon: "drill", produtoId: "1" },
    unreadCount: 2,
    messages: [
      {
        id: "m1",
        from: "them",
        type: "text",
        text: "Olá! Vi que você tem uma furadeira disponível.",
        time: "2026-07-23T10:30:00"
      },
      {
        id: "m2",
        from: "me",
        type: "text",
        text: "Oi Maria! Sim, está disponível. Por quanto tempo você precisa?",
        time: "2026-07-23T10:32:00",
        status: "read"
      },
      {
        id: "m3",
        from: "them",
        type: "text",
        text: "Preciso por 2 dias, para fazer uns reparos em casa.",
        time: "2026-07-23T10:35:00"
      },
      {
        id: "m4",
        from: "them",
        type: "text",
        text: "Ótimo! Quando posso buscar a furadeira?",
        time: "2026-07-23T10:41:00"
      }
    ]
  },
  {
    id: "c2",
    user: {
      id: "joao@vizin.com",
      name: "João Santos",
      avatar: "https://i.pravatar.cc/150?img=12",
      online: true
    },
    item: { name: "Escada", icon: "ladder", produtoId: "2" },
    unreadCount: 0,
    messages: [
      {
        id: "m5",
        from: "them",
        type: "text",
        text: "A escada está em ótimo estado, obrigado por avisar!",
        time: "2026-07-23T09:50:00"
      },
      {
        id: "m6",
        from: "me",
        type: "text",
        text: "Que bom que ajudou! Qualquer coisa é só chamar.",
        time: "2026-07-23T09:52:00",
        status: "read"
      },
      {
        id: "m7",
        from: "them",
        type: "text",
        text: "Obrigado por alugar minha escada!",
        time: "2026-07-23T10:12:00"
      }
    ]
  },
  {
    id: "c3",
    user: {
      id: "ana@vizin.com",
      name: "Ana Costa",
      avatar: "https://i.pravatar.cc/150?img=32",
      online: false
    },
    item: { name: "Serra", icon: "saw", produtoId: "3" },
    unreadCount: 1,
    messages: [
      {
        id: "m8",
        from: "them",
        type: "text",
        text: "Oi! Tenho interesse na serra que você anunciou.",
        time: "2026-07-23T08:30:00"
      },
      {
        id: "m9",
        from: "me",
        type: "text",
        text: "Oi Ana! Ela está em ótimo estado, uso pouco.",
        time: "2026-07-23T08:40:00",
        status: "delivered"
      },
      {
        id: "m10",
        from: "them",
        type: "text",
        text: "A serra está em perfeito estado?",
        time: "2026-07-23T09:20:00"
      }
    ]
  },
  {
    id: "c4",
    user: {
      id: "pedro@vizin.com",
      name: "Pedro Oliveira",
      avatar: "https://i.pravatar.cc/150?img=53",
      online: false
    },
    item: { name: "Betoneira", icon: "tool", produtoId: "4" },
    unreadCount: 0,
    messages: [
      {
        id: "m11",
        from: "me",
        type: "text",
        text: "Bom dia, Pedro! Tudo certo com a betoneira?",
        time: "2026-07-23T07:30:00",
        status: "read"
      },
      {
        id: "m12",
        from: "them",
        type: "text",
        text: "Vou devolver amanhã pela manhã",
        time: "2026-07-23T08:10:00"
      }
    ]
  }
];