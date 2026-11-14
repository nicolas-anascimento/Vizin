import { HttpError } from "../app/utils/httpError.ts";
import { serializeMessage } from "../app/utils/serializers.ts";
import { z } from "zod";
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
import { consumeRateLimit } from "../app/middlewares/rateLimit.ts";
import prisma from "../app/config/database.ts";
import { conversationEventSchema, sendMessageEventSchema } from "../app/schemas/conversations.schema.ts";
import { idSchema } from "../app/schemas/common.ts";

function eventData<S extends z.ZodType>(schema: S, input: unknown): z.output<S> {
  const parsed = schema.safeParse(input);
  if (!parsed.success) throw new HttpError(422, "Dados do evento inválidos");
  return parsed.data;
}

async function assertActive(userId:string):Promise<void>{
  const user=await prisma.usuarios.findUnique({where:{id:userId},select:{ativo:true}});
  if(!user?.ativo)throw new HttpError(403,"Sua conta está suspensa.","conta_suspensa");
}

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
  socket.on("chat:join", async (payload) => {
    try {
      await assertActive(socket.data.userId);
      const data = eventData(conversationEventSchema, payload);
      const conversation = await getChatConversation(
        data.conversation_id,
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
      const id = eventData(conversationEventSchema, payload).conversation_id;
      void socket.leave(conversationRoom(id));
    } catch (error) {
      socket.emit("socket:error", socketError(error, "chat:leave"));
    }
  });

  socket.on("message:send", async (payload) => {
    const parsedClientMessageId = idSchema.safeParse(payload?.client_message_id);
    const clientMessageId = parsedClientMessageId.success ? parsedClientMessageId.data : undefined;
    try {
      await assertActive(socket.data.userId);
      const limit = consumeRateLimit(`chat-message:user:${socket.data.userId}`, 60_000, 30);
      if (!limit.allowed) {
        throw new HttpError(429, "Muitas mensagens; aguarde um instante", "limite_mensagens");
      }
      const data = eventData(sendMessageEventSchema, payload);
      const result = await sendChatMessage({
        conversationId: data.conversation_id,
        senderId: socket.data.userId,
        content: data.content,
        attachmentId: data.attachment_id,
        clientMessageId: data.client_message_id,
      });
      publishPersistedMessage(result);
      socket.emit("message:ack", {
        client_message_id: data.client_message_id,
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
      await assertActive(socket.data.userId);
      const data = eventData(conversationEventSchema, payload);
      const result = await markChatRead(
        data.conversation_id,
        socket.data.userId,
      );
      publishReadUpdate(result);
    } catch (error) {
      socket.emit("socket:error", socketError(error, "message:read"));
    }
  });

  const typing = async (payload: ConversationPayload, active: boolean) => {
    try {
      await assertActive(socket.data.userId);
      const id = eventData(conversationEventSchema, payload).conversation_id;
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
