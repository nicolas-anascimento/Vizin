import type { RequestHandler } from "express";
import env from "../config/env.ts";
import { HttpError } from "../utils/httpError.ts";
const buckets = new Map<string, { count: number; expires: number }>();
// Limita alterações administrativas por usuário em janela de um minuto, sem afetar consultas.
export const adminWriteLimit: RequestHandler = (req, _res, next) => {
  if (["GET", "HEAD", "OPTIONS"].includes(req.method) || env.NODE_ENV === "test" || (env.NODE_ENV !== "production" && process.env.TEST_DATABASE_URL)) return next();
  const key = req.user!.id;
  const now = Date.now();
  if (buckets.size > 10000) for (const [id, bucket] of buckets) if (bucket.expires < now) buckets.delete(id);
  const bucket = buckets.get(key);
  const current = !bucket || bucket.expires < now ? { count: 0, expires: now + 60000 } : bucket;
  current.count++;
  buckets.set(key, current);
  if (current.count > 60) return next(new HttpError(429, "Muitas alterações administrativas", "rate_limit_admin"));
  next();
};
