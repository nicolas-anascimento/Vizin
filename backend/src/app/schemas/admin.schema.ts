import { z } from "zod";
import { booleanSchema, cpfSchema, idSchema, textSchema } from "./common.ts";

const statusBoolean = z.union([z.boolean(), z.enum(["true", "false", "1", "0", "on", "off"])]).transform(value => value === true || value === "true" || value === "1" || value === "on");
export const adminStatusSchema = z.object({ ativo: statusBoolean, motivo: textSchema(500).optional() });
export const adminCpfSchema = z.object({ cpf: cpfSchema });
export const adminItemSchema = z.strictObject({ disponivel: booleanSchema.optional(), motivo: textSchema(1000).optional() });
export const adminUnarchiveSchema = z.strictObject({ motivo: textSchema(1000) });
export const adminIdentityDecisionSchema = z.object({
  aprovar: z.boolean().optional(), revogar: z.boolean().optional(),
  status: z.string().optional(), motivo: textSchema(500).optional(),
});
export const adminNotificationReadSchema = z.object({ lida: booleanSchema });
export const adminCategoryMoveSchema = z.object({ destino_id: idSchema });
export const adminOccurrenceStatusSchema = z.object({ status: textSchema(20), motivo: textSchema(1000).optional() });
export const adminOccurrenceReplySchema = z.object({ mensagem: textSchema(10000) });
export const adminCampaignTestSchema = z.object({ titulo: textSchema(100), mensagem: textSchema(500) });
export const adminCampaignSchema = z.object({
  titulo: textSchema(100), mensagem: z.union([textSchema(500), z.literal("")]),
  status: textSchema(20), destinatarios: z.string(), agendada_para: z.string().optional(),
  chave_idempotencia: textSchema(200).optional(),
});
export const adminReviewSchema = z.object({ oculta: z.boolean(), motivo: textSchema(1000).optional() });
export const adminReasonSchema = z.object({ motivo: textSchema(1000) });
export const adminCategorySchema = z.object({ nome: textSchema(80), icone: textSchema(50), cor: textSchema(7) });
const categories = z.object({
  usuarios: booleanSchema, anuncios: booleanSchema, denuncias: booleanSchema,
  pagamentos: booleanSchema, avaliacoes: booleanSchema, verificacoes: booleanSchema, sistema: booleanSchema,
});
export const adminNotificationPreferencesSchema = z.object({ categorias: categories, somente_urgentes: booleanSchema });
export const adminMarkAllSchema = z.object({ categoria: z.string().optional() });

export type AdminStatusInput = z.input<typeof adminStatusSchema>;
export type AdminStatus = z.output<typeof adminStatusSchema>;
