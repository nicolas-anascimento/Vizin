import type { SerializedMessage } from "../app/utils/serializers.ts";

export interface ConversationPayload {
  conversation_id: string;
}

export interface SendMessagePayload extends ConversationPayload {
  content: string;
  attachment_id: string | null;
  client_message_id: string;
}

export interface MessageAckPayload {
  client_message_id: string;
  message: SerializedMessage;
}

export interface ReadUpdatePayload extends ConversationPayload {
  user_id: string;
  read_at: string;
}

export interface TypingUpdatePayload extends ConversationPayload {
  user_id: string;
  typing: boolean;
}

export interface ConversationUpdatePayload extends ConversationPayload {
  message: SerializedMessage;
}

export interface SocketErrorPayload {
  code: string;
  message: string;
  event?: string;
  client_message_id?: string;
}

export interface ClientToServerEvents {
  "chat:join": (payload: ConversationPayload) => void;
  "chat:leave": (payload: ConversationPayload) => void;
  "message:send": (payload: SendMessagePayload) => void;
  "message:read": (payload: ConversationPayload) => void;
  "typing:start": (payload: ConversationPayload) => void;
  "typing:stop": (payload: ConversationPayload) => void;
}

export interface ServerToClientEvents {
  "message:new": (message: SerializedMessage) => void;
  "message:ack": (payload: MessageAckPayload) => void;
  "message:read:update": (payload: ReadUpdatePayload) => void;
  "typing:update": (payload: TypingUpdatePayload) => void;
  "conversation:update": (payload: ConversationUpdatePayload) => void;
  "notification:new": (notification: Record<string, unknown>) => void;
  "socket:error": (error: SocketErrorPayload) => void;
}

export interface InterServerEvents {}

export interface SocketData {
  userId: string;
  email: string;
  role: "admin" | "usuario";
}
