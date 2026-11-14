import { z } from "zod";
import { textSchema } from "./common.ts";

export const cardTokenSchema = z.strictObject({ token_cartao: textSchema(1000) });
export const cardIdParamsSchema = z.object({ id: textSchema(200) });
export type CardTokenInput = z.input<typeof cardTokenSchema>;
