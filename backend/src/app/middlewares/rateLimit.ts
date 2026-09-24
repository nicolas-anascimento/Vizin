import { createHash } from "node:crypto";
import type { Request, RequestHandler } from "express";
import { getTrustedClientIp } from "../utils/clientIdentity.ts";

type Entry = { count: number; resetAt: number };
const buckets = new Map<string, Entry>();

export type RateLimitIdentity = "auto" | "ip";
export type RateLimitOptions = {
  windowMs: number;
  max: number;
  message?: string;
  code?: string;
  identity?: RateLimitIdentity;
  scope?: string;
  keyGenerator?: (req: Request) => string | null;
  skip?: (req: Request) => boolean;
};

export function getRateLimitKey(req: Request, identity: RateLimitIdentity = "auto"): string {
  if (identity === "auto" && req.user?.id) return `user:${req.user.id}`;
  return `ip:${getTrustedClientIp(req)}`;
}

// Proteção adicional do login: o CPF nunca fica armazenado como chave do bucket.
export function getLoginAccountRateLimitKey(req: Request): string | null {
  const raw = req.body?.cpf;
  if (typeof raw !== "string") return null;
  const normalized = raw.replace(/\D/g, "");
  if (normalized.length !== 11) return null;
  return `account:${createHash("sha256").update(normalized).digest("hex")}`;
}

export function consumeRateLimit(key: string, windowMs: number, max: number, now = Date.now()): Entry & { allowed: boolean } {
  const current = buckets.get(key);
  const entry = !current || current.resetAt <= now ? { count: 0, resetAt: now + windowMs } : current;
  entry.count += 1;
  buckets.set(key, entry);
  if (buckets.size > 10_000) {
    for (const [bucketKey, value] of buckets) if (value.resetAt <= now) buckets.delete(bucketKey);
  }
  return { ...entry, allowed: entry.count <= max };
}

// Limita por identidade centralizada. Após optionalAuth, o padrão é UUID; visitantes usam IP.
export function rateLimit(options: RateLimitOptions): RequestHandler {
  return (req, res, next) => {
    if (options.skip?.(req)) return next();
    const identityKey = options.keyGenerator
      ? options.keyGenerator(req)
      : getRateLimitKey(req, options.identity);
    if (!identityKey) return next();
    const scope = options.scope ?? `${req.baseUrl}:${req.route?.path ?? req.path}`;
    const entry = consumeRateLimit(`${scope}:${identityKey}`, options.windowMs, options.max);
    res.setHeader("RateLimit-Limit", String(options.max));
    res.setHeader("RateLimit-Remaining", String(Math.max(0, options.max - entry.count)));
    res.setHeader("RateLimit-Reset", String(Math.ceil(entry.resetAt / 1000)));
    if (!entry.allowed) {
      const message = options.message ?? "Muitas tentativas. Tente novamente mais tarde.";
      res.status(429).json({ success: false, codigo: options.code ?? "limite_requisicoes", message, mensagem: message });
      return;
    }
    next();
  };
}

export function resetRateLimitBucketsForTests(): void {
  buckets.clear();
}
