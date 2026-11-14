import { HttpError } from "./httpError.ts";
import { booleanSchema, cpfSchema, emailSchema, idSchema, passwordSchema, textSchema } from "../schemas/common.ts";
// Normaliza e valida o CPF recebido antes de usá-lo em cadastro ou autenticação.
export function cpf(value: unknown): string {
  const parsed = cpfSchema.safeParse(value);
  if (!parsed.success) throw new HttpError(422, "CPF inválido");
  return parsed.data;
}
// Exige texto não vazio e limita tamanho para proteger persistência e respostas.
export function text(value: unknown, field: string, max = 3000): string {
  const parsed = textSchema(max).safeParse(value);
  if (!parsed.success) throw new HttpError(422, `${field} inválido`);
  return parsed.data;
}
// Aplica os requisitos mínimos da senha antes de gerar hash.
export function password(value: unknown): string {
  const parsed = passwordSchema.safeParse(value);
  if (!parsed.success) throw new HttpError(422, "Senha deve conter letra e número e ter de 8 a 72 bytes");
  return parsed.data;
}
// Normaliza email e rejeita formatos inválidos.
export function email(value: unknown): string {
  const parsed = emailSchema.safeParse(value);
  if (!parsed.success) throw new HttpError(422, "E-mail inválido");
  return parsed.data;
}
// Valida UUIDs vindos de parâmetros ou corpo antes de formar consultas ao banco.
export function uuid(value: unknown, field = "ID"): string {
  const parsed = idSchema.safeParse(value);
  if (!parsed.success) throw new HttpError(422, `${field} inválido`);
  return parsed.data;
}
// Normaliza nomes usados na busca de categorias.
export function slug(value: string): string {
  const normalized = value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  return ["casa-e-jardim", "casa-jardim"].includes(normalized) ? "casajardim" : normalized;
}
// Converte opções recebidas do cliente e rejeita valores ambíguos.
export function boolean(value: unknown, field: string): boolean {
  const parsed = booleanSchema.safeParse(value);
  if (!parsed.success) throw new HttpError(422, `${field} deve ser booleano`);
  return parsed.data;
}
