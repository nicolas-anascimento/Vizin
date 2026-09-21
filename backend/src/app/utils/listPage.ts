import type { Response } from "express";
export { pagination } from "./admin.ts";
// Publica total e paginação nos cabeçalhos consumidos pelas listas do frontend.
export function pageHeaders(res: Response, total: number, page: number, limit: number): void {
  res.setHeader("X-Total-Count", String(total));
  res.setHeader("X-Page", String(page));
  res.setHeader("X-Limit", String(limit));
  res.setHeader("X-Total-Pages", String(Math.ceil(total / limit)));
}
