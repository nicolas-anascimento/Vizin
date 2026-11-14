import dotenv from "dotenv";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { z } from "zod";

const currentDir = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ quiet: true, path: path.resolve(currentDir, "../../../.env") });

const integer = (fallback: number) => z.string().optional().transform(value => value === undefined || value.trim() === "" ? fallback : Number(value)).pipe(z.int().positive());
const flag = (fallback: boolean) => z.enum(["true", "1", "yes", "on", "false", "0", "no", "off"]).optional().transform(value => value === undefined ? fallback : ["true", "1", "yes", "on"].includes(value.toLowerCase()));
const url = z.url();

export const environmentSchema = z.object({
  NODE_ENV: z.enum(["dev", "test", "production"]).default("dev"),
  PORT: integer(8080).pipe(z.number().max(65535)),
  APP_URL: url.default("http://localhost:8080"),
  FRONTEND_ORIGINS: z.string().optional(),
  DATABASE_URL: z.url().refine(value => URL.canParse(value) && ["postgres:", "postgresql:"].includes(new URL(value).protocol)),
  TEST_DATABASE_URL: z.string().optional(),
  JWT_KEY: z.string().min(32),
  TRUST_PROXY: z.string().optional(),
  COOKIE_SAME_SITE: z.enum(["none", "lax"]).default("lax"),
  CHAT_ATTACHMENT_MAX_MB: integer(50).pipe(z.number().max(50)),
  SMTP_HOST: z.string().default(""),
  SMTP_PORT: integer(587),
  SMTP_SECURE: flag(false),
  SMTP_USER: z.string().default(""),
  SMTP_PASS: z.string().default(""),
  SMTP_FROM: z.string().default(""),
  EMAIL_TRANSPORT: z.string().default(""),
  PASSWORD_TRANSPORT: z.string().default(""),
  PAYMENT_MODE: z.enum(["demo", "gateway"]).default("gateway"),
  MP_ACCESS_TOKEN: z.string().default(""),
  MP_WEBHOOK_SECRET: z.string().default(""),
  MP_NOTIFICATION_URL: z.string().default(""),
}).superRefine((value, ctx) => {
  const add = (field: string, message: string) => ctx.addIssue({ code: "custom", path: [field], message });
  const origins = (value.FRONTEND_ORIGINS || value.APP_URL).split(",").map(part => part.trim());
  if (origins.some(origin => !url.safeParse(origin).success)) add("FRONTEND_ORIGINS", "origens inválidas");
  if (value.TRUST_PROXY && ["true", "1", "yes", "on"].includes(value.TRUST_PROXY.toLowerCase())) add("TRUST_PROXY", "proxy irrestrito não é permitido");
  if (value.COOKIE_SAME_SITE === "none" && !value.APP_URL.startsWith("https://")) add("COOKIE_SAME_SITE", "SameSite=none exige HTTPS");
  if (value.NODE_ENV === "production") {
    const host = new URL(value.APP_URL).hostname;
    if (!value.APP_URL.startsWith("https://") || ["localhost", "127.0.0.1", "::1"].includes(host)) add("APP_URL", "produção exige URL pública HTTPS");
    if (value.PAYMENT_MODE === "demo") add("PAYMENT_MODE", "demo não é permitido em produção");
    if (value.PAYMENT_MODE === "gateway" && (!value.MP_ACCESS_TOKEN || !value.MP_WEBHOOK_SECRET || !value.MP_NOTIFICATION_URL)) add("PAYMENT_MODE", "credenciais do gateway incompletas");
  }
  if (value.MP_NOTIFICATION_URL) {
    const parsed = url.safeParse(value.MP_NOTIFICATION_URL);
    if (!parsed.success) add("MP_NOTIFICATION_URL", "URL inválida");
    else {
      const notification = new URL(parsed.data);
      if (notification.protocol !== "https:" || notification.pathname !== "/api/assinaturas/webhook" || notification.search || notification.hash) add("MP_NOTIFICATION_URL", "webhook deve usar HTTPS e /api/assinaturas/webhook");
    }
  }
});

const parsed = environmentSchema.safeParse(process.env);
if (!parsed.success) {
  const fields = [...new Set(parsed.error.issues.map(issue => String(issue.path[0] ?? "ambiente")))];
  throw new Error(`Configuração inválida: ${fields.join(", ")}`);
}

const raw = parsed.data;
const env = {
  ...raw,
  FRONTEND_ORIGINS: (raw.FRONTEND_ORIGINS || raw.APP_URL).split(",").map(value => new URL(value.trim()).origin),
  TRUST_PROXY: raw.TRUST_PROXY && raw.TRUST_PROXY.toLowerCase() !== "false"
    ? raw.TRUST_PROXY.split(",").map(value => value.trim()).filter(Boolean)
    : false,
  SMTP_USER: raw.SMTP_USER || raw.EMAIL_TRANSPORT,
  SMTP_PASS: raw.SMTP_PASS || raw.PASSWORD_TRANSPORT,
  SMTP_FROM: raw.SMTP_FROM || raw.SMTP_USER || raw.EMAIL_TRANSPORT,
};

export type Environment = typeof env;
export default env;
