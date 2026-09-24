import { isIP } from "node:net";
import type { Request } from "express";

function normalizedIp(value: unknown): string | null {
  if (typeof value !== "string") return null;
  let candidate = value.trim();
  if (!candidate || candidate.includes(",")) return null;
  if (candidate.startsWith("[")) {
    const end = candidate.indexOf("]");
    if (end > 0) candidate = candidate.slice(1, end);
  }
  const zone = candidate.indexOf("%");
  if (zone >= 0) candidate = candidate.slice(0, zone);
  if (candidate.toLowerCase().startsWith("::ffff:")) {
    const ipv4 = candidate.slice(7);
    if (isIP(ipv4) === 4) return ipv4;
  }
  return isIP(candidate) ? candidate.toLowerCase() : null;
}

function firstHeader(value: string | string[] | undefined): string | null {
  if (Array.isArray(value)) return value.length === 1 ? normalizedIp(value[0]) : null;
  return normalizedIp(value);
}

// Só considera headers do Cloudflare quando o peer TCP imediato foi aprovado pela
// configuração `trust proxy` do Express. No DEV, `loopback` representa o cloudflared local.
export function requestCameFromTrustedProxy(req: Request): boolean {
  const remoteAddress = req.socket.remoteAddress;
  if (!remoteAddress) return false;
  const trust = req.app.get("trust proxy fn") as
    | ((address: string, hop: number) => boolean)
    | undefined;
  return typeof trust === "function" && trust(remoteAddress, 0);
}

export function getTrustedClientIp(req: Request): string {
  const direct = normalizedIp(req.socket.remoteAddress) ?? "unknown";
  if (!requestCameFromTrustedProxy(req)) return direct;

  // O edge do Cloudflare define CF-Connecting-IP. X-Forwarded-For continua sendo
  // interpretado pelo Express conforme a cadeia e os proxies explicitamente confiados.
  const cloudflareIp = firstHeader(req.headers["cf-connecting-ip"]);
  return cloudflareIp ?? normalizedIp(req.ip) ?? direct;
}
