import { z } from "zod";
import { idSchema } from "./common.ts";
import { dateOnlySchema } from "../utils/dates.ts";

export const createRentalSchema = z.object({
  produto_id: idSchema.optional(), objeto_id: idSchema.optional(), item_id: idSchema.optional(), produtoId: idSchema.optional(),
  data_retirada: dateOnlySchema.optional(), dataRetirada: dateOnlySchema.optional(), data_inicio: dateOnlySchema.optional(), retirada: dateOnlySchema.optional(),
  data_devolucao: dateOnlySchema.optional(), dataDevolucao: dateOnlySchema.optional(), data_fim: dateOnlySchema.optional(), devolucao: dateOnlySchema.optional(),
}).superRefine((value, ctx) => {
  if (!(value.produto_id ?? value.objeto_id ?? value.item_id ?? value.produtoId)) ctx.addIssue({code:"custom",path:["produto_id"],message:"Objeto é obrigatório"});
  if (!(value.data_retirada ?? value.dataRetirada ?? value.data_inicio ?? value.retirada)) ctx.addIssue({code:"custom",path:["data_retirada"],message:"Data de retirada é obrigatória"});
  if (!(value.data_devolucao ?? value.dataDevolucao ?? value.data_fim ?? value.devolucao)) ctx.addIssue({code:"custom",path:["data_devolucao"],message:"Data de devolução é obrigatória"});
});
export const rentalStatusSchema = z.object({ status: z.string().trim().min(1) });
export const handoverBodySchema = z.object({
  aluguel_id: idSchema.optional(), pedido_id: idSchema.optional(), objeto_id: idSchema.optional(),
  observacoes: z.union([z.string().trim().min(1).max(3000), z.literal("")]).optional(),
  danos: z.union([z.string().trim().min(1).max(3000), z.literal("")]).optional(),
});
export const handoverParamsSchema = z.object({ aluguelId: idSchema });
export const rentalListQuerySchema = z.object({
  proprietarioId: idSchema.optional(), solicitanteId: idSchema.optional(),
  papel: z.string().optional(), tipo: z.string().optional(),
  page: z.string().optional(), limit: z.string().optional(),
});

export type CreateRentalInput = z.input<typeof createRentalSchema>;
export type CreateRentalData = z.output<typeof createRentalSchema>;
