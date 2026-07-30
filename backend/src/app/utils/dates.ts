import { HttpError } from "./httpError.ts";

export function parseDateOnly(value: unknown, field = "Data"): Date {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new HttpError(422, `${field} deve estar no formato YYYY-MM-DD`);
  }
  const date = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value) throw new HttpError(422, `${field} inválida`);
  return date;
}

export function rentalDays(start: Date, end: Date): number {
  const diff = Math.ceil((end.getTime() - start.getTime()) / 86_400_000);
  if (diff <= 0) throw new HttpError(422, "A devolução deve ocorrer depois da retirada");
  return diff;
}

export function formatBr(date: Date | null | undefined): string {
  if (!date) return "";
  return new Intl.DateTimeFormat("pt-BR", { timeZone: "UTC" }).format(date);
}
