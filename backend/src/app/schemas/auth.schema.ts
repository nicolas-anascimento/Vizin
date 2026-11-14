import { z } from "zod";
import { cpfSchema, emailSchema, passwordSchema, textSchema, tokenSchema } from "./common.ts";

const phone = z.string().refine(value => !value.trim() || /^[+()\d\s-]{8,20}$/.test(value));

export const registerSchema = z.object({
  nome: textSchema(100),
  email: emailSchema,
  cpf: cpfSchema,
  senha: passwordSchema,
  telefone: phone.optional(),
  whatsapp: phone.optional(),
});
export const loginSchema = z.object({
  cpf: cpfSchema,
  senha: z.string().min(1).refine(value => Buffer.byteLength(value) <= 72),
});
export const recoverySchema = z.object({ email: emailSchema });
export const resetSchema = z.object({ token: tokenSchema, senha: passwordSchema.optional(), senhaNova: passwordSchema.optional() });
export const tokenBodySchema = z.object({ token: tokenSchema });

export type RegisterInput = z.input<typeof registerSchema>;
export type RegisterData = z.output<typeof registerSchema>;
export type LoginInput = z.input<typeof loginSchema>;
export type LoginData = z.output<typeof loginSchema>;
