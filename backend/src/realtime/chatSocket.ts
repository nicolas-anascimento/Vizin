import { HttpError } from "../app/utils/httpError.ts";
import { serializeMessage } from "../app/utils/serializers.ts";
import { uuid } from "../app/utils/validation.ts";
import {
  getChatConversation,
  markChatRead,
  sendChatMessage,
} from "../app/services/chatService.ts";
import {
  conversationRoom,
  publishPersistedMessage,
  publishReadUpdate,
} from "./realtimeService.ts";
import type { ConversationPayload, SocketErrorPayload } from "./types.ts";
import type { RealtimeSocket } from "./socket.ts";

function socketError(
  error: unknown,
  event: string,
  clientMessageId?: string,
): SocketErrorPayload {
  return {
    code: error instanceof HttpError ? error.codigo ?? `http_${error.status}` : "erro_interno",
    message: error instanceof HttpError ? error.message : "Não foi possível concluir a operação",
    event,
    ...(clientMessageId ? { client_message_id: clientMessageId } : {}),
  };
}

export function registerChatSocket(socket: RealtimeSocket): void {
  let messageWindowStartedAt = Date.now();
  let messagesInWindow = 0;

  socket.on("chat:join", async (payload) => {
    try {
      const conversation = await getChatConversation(
        payload?.conversation_id,
        socket.data.userId,
        true,
      );
      await socket.join(conversationRoom(conversation.id));
    } catch (error) {
      socket.emit("socket:error", socketError(error, "chat:join"));
    }
  });

  socket.on("chat:leave", (payload) => {
    try {
      const id = uuid(payload?.conversation_id, "Conversa");
      void socket.leave(conversationRoom(id));
    } catch (error) {
      socket.emit("socket:error", socketError(error, "chat:leave"));
    }
  });

  socket.on("message:send", async (payload) => {
    const clientMessageId = payload?.client_message_id;
    try {
      const now = Date.now();
      if (now - messageWindowStartedAt >= 60_000) {
        messageWindowStartedAt = now;
        messagesInWindow = 0;
      }
      messagesInWindow += 1;
      if (messagesInWindow > 30) {
        throw new HttpError(429, "Muitas mensagens; aguarde um instante", "limite_mensagens");
      }
      uuid(clientMessageId, "Mensagem do cliente");
      const result = await sendChatMessage({
        conversationId: payload?.conversation_id,
        senderId: socket.data.userId,
        content: payload?.content,
        attachmentId: payload?.attachment_id,
        clientMessageId,
      });
      publishPersistedMessage(result);
      socket.emit("message:ack", {
        client_message_id: clientMessageId,
        message: serializeMessage(result.message, socket.data.userId),
      });
    } catch (error) {
      socket.emit(
        "socket:error",
        socketError(error, "message:send", clientMessageId),
      );
    }
  });

  socket.on("message:read", async (payload) => {
    try {
      const result = await markChatRead(
        payload?.conversation_id,
        socket.data.userId,
      );
      publishReadUpdate(result);
    } catch (error) {
      socket.emit("socket:error", socketError(error, "message:read"));
    }
  });

  const typing = async (payload: ConversationPayload, active: boolean) => {
    try {
      const id = uuid(payload?.conversation_id, "Conversa");
      const room = conversationRoom(id);
      if (!socket.rooms.has(room)) {
        throw new HttpError(403, "Entre na conversa antes de digitar");
      }
      // Revalida participação e bloqueios porque o estado pode ter mudado
      // depois que o socket entrou na room.
      await getChatConversation(id, socket.data.userId, true);
      socket.to(room).emit("typing:update", {
        conversation_id: id,
        user_id: socket.data.userId,
        typing: active,
      });
    } catch (error) {
      socket.emit(
        "socket:error",
        socketError(error, active ? "typing:start" : "typing:stop"),
      );
    }
  };
  socket.on("typing:start", (payload) => void typing(payload, true));
  socket.on("typing:stop", (payload) => void typing(payload, false));
}
