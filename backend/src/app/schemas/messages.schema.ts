import { z } from "zod";
import { idSchema, textSchema } from "./common.ts";

export const messagesQuerySchema = z.object({ aluguel_id: idSchema, page: z.string().optional(), limit: z.string().optional() });
export const sendMessageSchema = z.object({ aluguel_id: idSchema, conteudo: textSchema(3000) });
export type SendMessage = z.output<typeof sendMessageSchema>;
