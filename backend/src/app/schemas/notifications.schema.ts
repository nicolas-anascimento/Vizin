import { z } from "zod";
import { booleanSchema } from "./common.ts";

export const notificationReadSchema = z.object({ lida: booleanSchema.optional() });
export const notificationSinceSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}T.*(?:Z|[+-]\d{2}:\d{2})$/).refine(value => Number.isFinite(new Date(value).getTime()));
export type NotificationRead = z.output<typeof notificationReadSchema>;
