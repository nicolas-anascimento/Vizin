import prisma from "../config/database.ts";
import { HttpError } from "../utils/httpError.ts";
import { createNotification } from "./notificationPreferences.ts";
import { text, uuid } from "../utils/validation.ts";

export const chatMessageInclude = {
  anexo: true,
  usuarios_mensagens_remetente_idTousuarios: {
    select: { id: true, nome: true },
  },
} as const;

const conversationInclude = {
  participantes: {
    include: {
      usuario: {
        select: { id: true, nome: true, foto_url: true, ativo: true },
      },
    },
  },
} as const;

export async function getChatConversation(
  conversationId: unknown,
  userId: string,
  requireUnblocked = false,
) {
  const id = uuid(conversationId, "Conversa");
  const conversation = await prisma.conversas.findFirst({
    where: { id, participantes: { some: { usuario_id: userId } } },
    include: conversationInclude,
  });
  if (!conversation) throw new HttpError(404, "Conversa não encontrada");

  const participantIds = conversation.participantes.map((row) => row.usuario_id);
  if (requireUnblocked) {
    const otherIds = participantIds.filter((id) => id !== userId);
    const blocked = await prisma.bloqueios.count({
      where: {
        OR: [
          { usuario_id: userId, bloqueado_id: { in: otherIds } },
          { usuario_id: { in: otherIds }, bloqueado_id: userId },
        ],
      },
    });
    if (blocked) throw new HttpError(403, "Conversa bloqueada");
  }
  return conversation;
}

export interface SendChatMessageInput {
  conversationId: unknown;
  senderId: string;
  content?: unknown;
  attachmentId?: unknown;
  clientMessageId?: unknown;
}

// Persiste mensagem e notificação na mesma transação antes de qualquer emissão realtime.
export async function sendChatMessage(input: SendChatMessageInput) {
  const conversation = await getChatConversation(
    input.conversationId,
    input.senderId,
  );
  const recipient = conversation.participantes.find(
    (participant) => participant.usuario_id !== input.senderId,
  )?.usuario;
  if (!recipient) throw new HttpError(409, "Conversa sem destinatário válido");

  const content = input.content ? text(input.content, "Mensagem", 3000) : "";
  const attachmentId = input.attachmentId
    ? uuid(input.attachmentId, "Anexo")
    : null;
  const clientMessageId = input.clientMessageId
    ? uuid(input.clientMessageId, "Mensagem do cliente")
    : null;
  if (!content && !attachmentId) throw new HttpError(422, "Mensagem vazia");

  const result = await prisma.$transaction(async (tx) => {
    for (const id of [input.senderId, recipient.id].sort()) {
      await tx.$queryRaw`SELECT id FROM usuarios WHERE id=${id}::uuid FOR UPDATE`;
    }

    const currentUsers = await tx.usuarios.findMany({
      where: { id: { in: [input.senderId, recipient.id] } },
      select: { id: true, ativo: true },
    });
    const blocked = await tx.bloqueios.count({
      where: {
        OR: [
          { usuario_id: input.senderId, bloqueado_id: recipient.id },
          { usuario_id: recipient.id, bloqueado_id: input.senderId },
        ],
      },
    });
    if (
      currentUsers.length !== 2 ||
      currentUsers.some((user) => !user.ativo) ||
      blocked
    ) {
      throw new HttpError(403, "Conversa bloqueada");
    }

    if (clientMessageId) {
      const existing = await tx.mensagens.findFirst({
        where: { remetente_id: input.senderId, cliente_id: clientMessageId },
        include: chatMessageInclude,
      });
      if (existing) {
        if (existing.conversa_id !== conversation.id) {
          throw new HttpError(409, "Identificador de mensagem já utilizado");
        }
        return { message: existing, notification: null, created: false };
      }
    }

    if (
      attachmentId &&
      !(await tx.anexos.findFirst({
        where: {
          id: attachmentId,
          usuario_id: input.senderId,
          mensagem: null,
        },
      }))
    ) {
      throw new HttpError(403, "Anexo indisponível");
    }

    const message = await tx.mensagens.create({
      data: {
        conversa_id: conversation.id,
        cliente_id: clientMessageId,
        remetente_id: input.senderId,
        destinatario_id: recipient.id,
        conteudo: content,
        anexo_id: attachmentId,
      },
      include: chatMessageInclude,
    });
    await tx.conversas.update({
      where: { id: conversation.id },
      data: { atualizado_em: new Date() },
    });
    const notification = await createNotification(tx, {
        usuario_id: recipient.id,
        tipo: "mensagem",
        titulo: "Nova mensagem",
        mensagem: content.slice(0, 140) || "Novo anexo",
        contexto: {
          conversaId: conversation.id,
          usuarioId: input.senderId,
          ...(conversation.objeto_id
            ? { objetoId: conversation.objeto_id }
            : {}),
        },
    });
    return { message, notification, created: true };
  });

  return {
    ...result,
    conversationId: conversation.id,
    senderId: input.senderId,
    recipientId: recipient.id,
    participantIds: conversation.participantes.map((row) => row.usuario_id),
  };
}

// Compartilhado pelo POST REST e por message:read.
export async function markChatRead(conversationId: unknown, userId: string) {
  const conversation = await getChatConversation(conversationId, userId);
  const readAt = new Date();
  await prisma.$transaction([
    prisma.mensagens.updateMany({
      where: {
        conversa_id: conversation.id,
        destinatario_id: userId,
        lida: false,
      },
      data: { lida: true },
    }),
    prisma.participantes_conversa.update({
      where: {
        conversa_id_usuario_id: {
          conversa_id: conversation.id,
          usuario_id: userId,
        },
      },
      data: { lida_em: readAt },
    }),
  ]);
  return {
    conversationId: conversation.id,
    userId,
    readAt,
    participantIds: conversation.participantes.map((row) => row.usuario_id),
  };
}
