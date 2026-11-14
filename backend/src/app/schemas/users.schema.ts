import { z } from "zod";
import { booleanSchema, emailSchema, passwordSchema, textSchema } from "./common.ts";

const optionalEmptyText = (max: number) => z.union([textSchema(max), z.literal("")]);
const phone = z.union([z.literal(""), z.string().regex(/^[+()\d\s-]{8,20}$/)]);

export const profilePatchSchema = z.object({
  nome: textSchema(100).optional(),
  bio: optionalEmptyText(1000).optional(),
  telefone: phone.optional(),
  whatsapp: phone.optional(),
});
export const changeEmailSchema = z.object({ email: emailSchema, senha: z.unknown() });
export const changePhoneSchema = z.object({ telefone: phone.optional(), whatsapp: phone.optional() });
export const changePasswordSchema = z.object({
  senhaAtual: z.unknown().optional(),
  senha_atual: z.unknown().optional(),
  senhaNova: passwordSchema.optional(),
  nova_senha: passwordSchema.optional(),
});
export const accountPasswordSchema = z.object({ senha: z.unknown() });
export const privacySchema = z.strictObject({ perfilPublico: booleanSchema.optional() });
export const notificationPreferencesPatchSchema = z.strictObject({
  solicitacao_recebida: z.boolean().optional(), solicitacao_respondida: z.boolean().optional(),
  lembretes_aluguel: z.boolean().optional(), avaliacao_recebida: z.boolean().optional(),
  mensagens: z.boolean().optional(), novidades: z.boolean().optional(),
});

export type ProfilePatch = z.output<typeof profilePatchSchema>;
export type ChangeEmail = z.output<typeof changeEmailSchema>;
