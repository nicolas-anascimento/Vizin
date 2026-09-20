import dotenv from "dotenv";
import path from "node:path";
import { fileURLToPath } from "node:url";

// Lê a configuração do backend e valida os valores necessários antes de iniciar o servidor.
const currentDir = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ quiet: true, path: path.resolve(currentDir, "../../../.env") });

// Falha cedo se uma credencial obrigatória não estiver definida.
function required(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Variável de ambiente obrigatória ausente: ${name}`);
  return value;
}

function positiveInteger(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1) return fallback;
  return parsed;
}

function booleanValue(value: string | undefined, fallback: boolean): boolean {
  if (value === undefined) return fallback;
  return ["true", "1", "yes", "on"].includes(value.toLowerCase());
}

const rawNodeEnv = process.env.NODE_ENV?.trim() || "dev";
if (!["dev", "test", "production"].includes(rawNodeEnv)) {
  throw new Error("NODE_ENV deve ser dev, test ou production");
}
const nodeEnv = rawNodeEnv as "dev" | "test" | "production";
const appUrl = process.env.APP_URL?.trim() || "http://localhost:8080";
try {
  new URL(appUrl);
} catch {
  throw new Error("APP_URL deve ser uma URL válida");
}

// Centraliza URL, cookies, SMTP, pagamento e origens permitidas usadas pelos módulos.
const env = {
  NODE_ENV: nodeEnv,
  FRONTEND_ORIGINS: (process.env.FRONTEND_ORIGINS || appUrl).split(",").map(v => new URL(v.trim()).origin),
  COOKIE_SAME_SITE: process.env.COOKIE_SAME_SITE === "none" ? "none" as const : "lax" as const,
  PORT: positiveInteger(process.env.PORT, 8080),
  DATABASE_URL: required("DATABASE_URL"),
  JWT_KEY: required("JWT_KEY"),
  APP_URL: appUrl,
  TRUST_PROXY: booleanValue(process.env.TRUST_PROXY, false),
  SMTP_HOST: process.env.SMTP_HOST?.trim() ?? "",
  SMTP_PORT: positiveInteger(process.env.SMTP_PORT, 587),
  SMTP_SECURE: booleanValue(process.env.SMTP_SECURE, false),
  SMTP_USER: process.env.SMTP_USER?.trim() || process.env.EMAIL_TRANSPORT?.trim() || "",
  SMTP_PASS: process.env.SMTP_PASS?.trim() || process.env.PASSWORD_TRANSPORT?.trim() || "",
  SMTP_FROM: process.env.SMTP_FROM?.trim() || process.env.SMTP_USER?.trim() || process.env.EMAIL_TRANSPORT?.trim() || "",
  EMAIL_TRANSPORT: process.env.EMAIL_TRANSPORT?.trim() ?? "",
  PASSWORD_TRANSPORT: process.env.PASSWORD_TRANSPORT?.trim() ?? "",
  PAYMENT_MODE: process.env.PAYMENT_MODE === "demo" ? "demo" : "gateway",
  MP_ACCESS_TOKEN: process.env.MP_ACCESS_TOKEN?.trim() ?? "",
  MP_WEBHOOK_SECRET: process.env.MP_WEBHOOK_SECRET?.trim() ?? "",
};

// Impede configuração insegura ou incompleta de autenticação e pagamentos em produção.
if (env.JWT_KEY.length < 32) throw new Error("JWT_KEY deve ter pelo menos 32 caracteres");
if (env.NODE_ENV === "production" && env.PAYMENT_MODE === "demo") throw new Error("PAYMENT_MODE=demo não é permitido em produção");
if (env.NODE_ENV === "production" && env.PAYMENT_MODE === "gateway" && (!env.MP_ACCESS_TOKEN || !env.MP_WEBHOOK_SECRET)) throw new Error("MP_ACCESS_TOKEN e MP_WEBHOOK_SECRET são obrigatórios em produção com PAYMENT_MODE=gateway");

export default env;

if (env.COOKIE_SAME_SITE === "none" && !env.APP_URL.startsWith("https://")) throw new Error("SameSite=none exige HTTPS");
