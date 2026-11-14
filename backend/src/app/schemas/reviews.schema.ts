import { z } from "zod";
import { idSchema, textSchema } from "./common.ts";

export const reviewBodySchema = z.object({
  aluguel_id: idSchema.optional(),
  nota: z.union([z.int(), z.string().regex(/^[1-5]$/).transform(Number)]).pipe(z.int().min(1).max(5)),
  comentario: z.union([textSchema(3000), z.literal("")]).optional(),
});
export type ReviewBody = z.output<typeof reviewBodySchema>;
