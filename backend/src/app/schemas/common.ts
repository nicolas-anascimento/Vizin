import { z } from "zod";

const cpfDigits = (value: string): boolean => {
  if (value.length !== 11 || /^(\d)\1{10}$/.test(value)) return false;
  for (const length of [9, 10]) {
    const sum = [...value.slice(0, length)].reduce((total, digit, index) => total + Number(digit) * (length + 1 - index), 0);
    if ((sum * 10 % 11) % 10 !== Number(value[length])) return false;
  }
  return true;
};

export const cpfSchema = z.string().regex(/^[\d.\-\s]+$/).transform(value => value.replace(/\D/g, "")).refine(cpfDigits);
export const passwordSchema = z.string().min(8).refine(value => Buffer.byteLength(value) <= 72 && /[A-Za-z]/.test(value) && /\d/.test(value));
export const emailSchema = z.string().trim().min(1).max(150).refine(value => !/[<>\u0000]/.test(value)).transform(value => value.toLowerCase()).refine(value => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value));
// UUIDs legados do VIZIN aceitam qualquer variante hexadecimal; z.guid preserva esse contrato.
export const idSchema = z.guid();
export const tokenSchema = z.string().regex(/^[a-f0-9]{64}$/);
export const booleanSchema = z.union([z.boolean(), z.enum(["true", "false"])]).transform(value => value === true || value === "true");
export const textSchema = (max = 3000) => z.string().trim().min(1).max(max).refine(value => !/[<>\u0000]/.test(value));
export const idParamsSchema = z.object({ id: idSchema });

export type CpfInput = z.input<typeof cpfSchema>;
export type Cpf = z.output<typeof cpfSchema>;
export type EmailInput = z.input<typeof emailSchema>;
export type Email = z.output<typeof emailSchema>;
