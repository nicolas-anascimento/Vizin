// Limites compartilhados pelos jobs financeiros para reduzir carga e evitar processamento simultâneo.
export const FINANCIAL_BATCH_SIZE = 100;
export const FINANCIAL_LEASE_MS = 120_000;

// Agenda nova tentativa com atraso progressivo para falhas transitórias do provedor.
export function nextRetry(attempt: number, now = new Date()): Date {
  const delay = Math.min(60 * 60_000, 1000 * 2 ** Math.min(12, Math.max(0, attempt - 1)));
  return new Date(now.getTime() + delay);
}
