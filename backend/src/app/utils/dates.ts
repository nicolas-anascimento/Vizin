import { HttpError } from "./httpError.ts";

// Todas as datas de negócio usam o calendário de America/Sao_Paulo, independentemente do fuso do servidor.
export const BUSINESS_TIME_ZONE = "America/Sao_Paulo";
// Extrai ano, mês e dia locais e os representa em UTC para comparar datas sem horário.
export function businessDate(at = new Date()): Date {
  const parts = Object.fromEntries(new Intl.DateTimeFormat("en-US", { timeZone: BUSINESS_TIME_ZONE, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(at).filter(part => part.type !== "literal").map(part => [part.type, Number(part.value)]));
  return new Date(Date.UTC(parts.year!, parts.month! - 1, parts.day!));
}

// Conta dias civis após o vencimento; antes dele o atraso permanece zero.
export function businessLateDays(due: Date, at = new Date()): number {
  return Math.max(0, Math.round((businessDate(at).getTime() - due.getTime()) / 86_400_000));
}

// Encontra o instante UTC que corresponde à meia-noite local, corrigindo o deslocamento do fuso.
export function businessDayStart(day: Date): Date {
  const target = Date.UTC(day.getUTCFullYear(), day.getUTCMonth(), day.getUTCDate());
  let instant = target;
  const formatter = new Intl.DateTimeFormat("en-US", { timeZone: BUSINESS_TIME_ZONE, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23" });
  for (let i = 0; i < 4; i++) {
    const parts = Object.fromEntries(formatter.formatToParts(new Date(instant)).filter(part => part.type !== "literal").map(part => [part.type, Number(part.value)]));
    const represented = Date.UTC(parts.year!, parts.month! - 1, parts.day!, parts.hour!, parts.minute!, parts.second!);
    const correction = target - represented;
    if (!correction) break;
    instant += correction;
  }
  return new Date(instant);
}

// Exige YYYY-MM-DD e confirma que a data existe, evitando normalização silenciosa de dias inválidos.
export function parseDateOnly(value: unknown, field = "Data"): Date {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new HttpError(422, `${field} deve estar no formato YYYY-MM-DD`);
  }
  const date = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value) throw new HttpError(422, `${field} inválida`);
  return date;
}

// Calcula a duração usada na cobrança e rejeita devolução anterior à retirada.
export function rentalDays(start: Date, end: Date): number {
  const diff = Math.ceil((end.getTime() - start.getTime()) / 86_400_000);
  if (diff < 0) throw new HttpError(422, "A devolução deve ocorrer depois da retirada");
  return Math.max(1, diff);
}

// Formata datas para exibição no contrato brasileiro sem mudar o dia armazenado.
export function formatBr(date: Date | null | undefined): string {
  if (!date) return "";
  return new Intl.DateTimeFormat("pt-BR", { timeZone: "UTC" }).format(date);
}
