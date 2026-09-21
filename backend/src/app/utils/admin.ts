import type { Request } from "express";
import { HttpError } from "./httpError.ts";
import type prisma from "../config/database.ts";
import { businessDayStart, parseDateOnly } from "./dates.ts";

type Tx = Parameters<Parameters<typeof prisma.$transaction>[0]>[0];
// Valida página e limite de consultas administrativas paginadas.
export function pagination(req: Request, defaultLimit = 20) {
  const parse = (value: unknown, fallback: number) => {
    if (value === undefined) return fallback;
    if (typeof value !== "string" || !/^[1-9]\d*$/.test(value)) throw new HttpError(422, "Paginação inválida", "paginacao_invalida");
    const n = Number(value);
    if (!Number.isSafeInteger(n)) throw new HttpError(422, "Paginação inválida", "paginacao_invalida");
    return n;
  };
  const page = parse(req.query.page, 1), limit = Math.min(100, parse(req.query.limit, defaultLimit));
  if ((page - 1) * limit > Number.MAX_SAFE_INTEGER) throw new HttpError(422, "Paginação inválida", "paginacao_invalida");
  return { page, limit, skip: (page - 1) * limit };
}
// Monta estrutura de resposta com dados e metadados de paginação.
export function paged<T>(data: T[], total: number, page: number, limit: number) {
  return { data, page, limit, total, totalPages: Math.ceil(total / limit) };
}
// Extrai intervalo de datas para filtrar consultas do painel.
export function dateFilters(req: Request) {
  const parse = (v: unknown, end: boolean) => {
    if (v === undefined) return undefined;
    const date = parseDateOnly(v, "Data");
    if (end) date.setUTCDate(date.getUTCDate() + 1);
    return businessDayStart(date);
  };
  const start = parse(req.query.dataInicio, false), end = parse(req.query.dataFim, true);
  if (start && end && start >= end) throw new HttpError(422, "Intervalo inválido");
  return start || end ? { ...(start ? { gte: start } : {}), ...(end ? { lt: end } : {}) } : undefined;
}
// Restringe filtro de status aos valores permitidos por cada recurso.
export function statusFilter(req: Request, allowed: readonly string[]): string | undefined {
  if (req.query.status === undefined) return undefined;
  if (typeof req.query.status !== "string" || !allowed.includes(req.query.status)) throw new HttpError(422, "Status inválido", "status_invalido");
  return req.query.status;
}
// Persiste autor, ação, entidade e metadados da alteração administrativa na mesma transação.
export async function audit(tx: Tx, adminId: string, acao: string, entidade: string, entidadeId: string, metadata: Record<string, string | number | boolean | null> = {}) {
  await tx.admin_auditoria.create({ data: { admin_id: adminId, acao, entidade, entidade_id: entidadeId, metadata } });
}
