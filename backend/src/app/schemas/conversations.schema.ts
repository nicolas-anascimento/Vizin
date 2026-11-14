import { z } from "zod";
import { idSchema } from "./common.ts";

export const conversationEventSchema = z.object({ conversation_id: idSchema });
export const sendMessageEventSchema = conversationEventSchema.extend({
  content: z.string(),
  attachment_id: idSchema.nullable(),
  client_message_id: idSchema,
});
export const createConversationSchema = z.object({ userId: idSchema, produtoId: idSchema.optional() });
export const sendConversationMessageSchema = z.object({
  text: z.string().optional(),
  attachmentId: idSchema.nullable().optional(),
  client_message_id: idSchema.optional(),
  clientMessageId: idSchema.optional(),
});
export const userIdParamsSchema = z.object({ userId: idSchema });

export type ConversationEvent = z.output<typeof conversationEventSchema>;
export type SendMessageEvent = z.output<typeof sendMessageEventSchema>;
