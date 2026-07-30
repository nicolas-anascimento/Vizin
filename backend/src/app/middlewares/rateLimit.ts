import type { RequestHandler } from "express";

type Entry = { count: number; resetAt: number };
const buckets = new Map<string, Entry>();

export function rateLimit(options: { windowMs: number; max: number; message?: string }): RequestHandler {
  return (req, res, next) => {
    const now = Date.now();
    const key = `${req.ip ?? "unknown"}:${req.baseUrl}:${req.path}`;
    const current = buckets.get(key);
    const entry = !current || current.resetAt <= now ? { count: 0, resetAt: now + options.windowMs } : current;
    entry.count += 1;
    buckets.set(key, entry);
    res.setHeader("RateLimit-Limit", String(options.max));
    res.setHeader("RateLimit-Remaining", String(Math.max(0, options.max - entry.count)));
    res.setHeader("RateLimit-Reset", String(Math.ceil(entry.resetAt / 1000)));
    if (entry.count > options.max) {
      res.status(429).json({ success: false, message: options.message ?? "Muitas tentativas. Tente novamente mais tarde." });
      return;
    }
    if (buckets.size > 10_000) {
      for (const [bucketKey, value] of buckets) if (value.resetAt <= now) buckets.delete(bucketKey);
    }
    next();
  };
}
