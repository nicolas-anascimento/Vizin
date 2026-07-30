import dotenv from "dotenv";
import path from "node:path";
import { fileURLToPath } from "node:url";

const currentDir = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(currentDir, "../../../.env") });

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

const env = {
  NODE_ENV: nodeEnv,
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
};

if (env.JWT_KEY.length < 32) throw new Error("JWT_KEY deve ter pelo menos 32 caracteres");

export default env;
