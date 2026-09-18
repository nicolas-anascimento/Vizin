import { HttpError } from "./httpError.ts";
export function cpf(value: unknown): string {
  if (typeof value !== "string" || !/^[\d.\-\s]+$/.test(value)) throw new HttpError(422, "CPF inválido");
  const digits = value.replace(/\D/g, "");
  if (digits.length !== 11 || /^(\d)\1{10}$/.test(digits)) throw new HttpError(422, "CPF inválido");
  for (const length of [9, 10]) {
    const sum = [...digits.slice(0, length)].reduce((n, d, i) => n + Number(d) * (length + 1 - i), 0);
    const check = (sum * 10 % 11) % 10;
    if (check !== Number(digits[length])) throw new HttpError(422, "CPF inválido");
  }
  return digits;
}
export function text(value: unknown, field: string, max = 3000): string {
  if (typeof value !== "string" || !value.trim() || value.trim().length > max || /[<>\u0000]/.test(value)) throw new HttpError(422, `${field} inválido`);
  return value.trim();
}
export function password(value: unknown): string {
  if (typeof value !== "string" || value.length < 8 || Buffer.byteLength(value) > 72 || !/[A-Za-z]/.test(value) || !/\d/.test(value)) throw new HttpError(422, "Senha deve conter letra e número e ter de 8 a 72 bytes");
  return value;
}
export function email(value: unknown): string {
  const result = text(value, "E-mail", 150).toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(result)) throw new HttpError(422, "E-mail inválido");
  return result;
}
export function uuid(value: unknown, field = "ID"): string {
  if (typeof value !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)) throw new HttpError(422, `${field} inválido`);
  return value;
}
export function slug(value: string): string {
  if (["casa-e-jardim", "casa-jardim"].includes(value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-"))) return "casajardim";
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}
export function boolean(value: unknown, field: string): boolean {
  if (value === true || value === "true") return true;
  if (value === false || value === "false") return false;
  throw new HttpError(422, `${field} deve ser booleano`);
}
