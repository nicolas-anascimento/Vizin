import { z } from "zod";

const optionalTextSchema = z.string().trim().min(1);
const positiveNumberSchema = z.union([z.number(), z.string().trim().min(1).transform(Number)]).pipe(z.number().finite().positive());
const optionBooleanSchema = z.union([z.boolean(), z.string()]).transform(value => typeof value === "boolean" ? value : ["true", "1", "on"].includes(value));

// Normaliza texto opcional e diferencia valor ausente de conteúdo informado.
export function nonEmptyString(value: unknown): string | null {
  const parsed = optionalTextSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

// Interpreta opções booleanas aceitas nos formulários.
export function asBoolean(value: unknown, fallback = false): boolean {
  const parsed = optionBooleanSchema.safeParse(value);
  return parsed.success ? parsed.data : fallback;
}

// Valida valores positivos recebidos como texto ou número.
export function asPositiveNumber(value: unknown): number | null {
  const parsed = positiveNumberSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

// Deriva iniciais para apresentação de usuários sem imagem.
export function initials(name: string): string {
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
}
