import type { RealtimeServer } from "./socket.ts";
import type { markChatRead, sendChatMessage } from "../app/services/chatService.ts";
import {
  serializeMessage,
  serializeNotification,
} from "../app/utils/serializers.ts";

let realtimeServer: RealtimeServer | null = null;

export const userRoom = (userId: string): string => `user:${userId}`;
export const conversationRoom = (conversationId: string): string =>
  `conversation:${conversationId}`;

export function registerRealtimeServer(io: RealtimeServer): void {
  realtimeServer = io;
}

export function publishPersistedMessage(
  result: Awaited<ReturnType<typeof sendChatMessage>>,
): void {
  if (!realtimeServer || !result.created) return;
  const message = serializeMessage(result.message, "");
  realtimeServer
    .to(conversationRoom(result.conversationId))
    .emit("message:new", message);
  for (const participantId of result.participantIds) {
    realtimeServer.to(userRoom(participantId)).emit("conversation:update", {
      conversation_id: result.conversationId,
      message,
    });
  }
  if (result.notification) {
    realtimeServer
      .to(userRoom(result.recipientId))
      .emit("notification:new", serializeNotification(result.notification));
  }
}

export function publishReadUpdate(
  result: Awaited<ReturnType<typeof markChatRead>>,
): void {
  if (!realtimeServer) return;
  realtimeServer
    .to(conversationRoom(result.conversationId))
    .emit("message:read:update", {
      conversation_id: result.conversationId,
      user_id: result.userId,
      read_at: result.readAt.toISOString(),
    });
}
