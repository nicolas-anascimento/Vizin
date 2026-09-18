import path from "node:path";
import { fileURLToPath } from "node:url";
import cookieParser from "cookie-parser";
import express, { type RequestHandler } from "express";
import env from "./app/config/env.ts";
import prisma from "./app/config/database.ts";
import { requireAuth, optionalAuth } from "./app/middlewares/auth.ts";
import { errorHandler, notFound } from "./app/middlewares/errorHandler.ts";
import { maintainRentals } from "./app/services/rentalMaintenance.ts";
import { paymentWebhook } from "./app/controllers/paymentsController.ts";
import api from "./app/routes/api.ts";
import web from "./app/routes/web.ts";
import { uploadsRoot } from "./app/utils/files.ts";

const app = express();
const here = path.dirname(fileURLToPath(import.meta.url));
const frontendRoot = path.resolve(here, "../../frontend-mocks");

app.disable("x-powered-by");
app.set("trust proxy", env.TRUST_PROXY);
const securityHeaders: RequestHandler = (_req, res, next) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  res.setHeader("Permissions-Policy", `camera=(), microphone=(), geolocation=(self ${env.FRONTEND_ORIGINS.map(origin => JSON.stringify(new URL(origin).origin)).join(" ")})`);
  next();
};
app.use(cookieParser());
app.use(securityHeaders);
app.use((req, res, next) => {
  const origin = req.headers.origin;
  if (origin && !env.FRONTEND_ORIGINS.includes(origin)) { res.status(403).json({ success: false, message: "Origem não permitida" }); return; }
  if (origin) {
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Vary", "Origin");
    res.setHeader("Access-Control-Allow-Credentials", "true");
    res.setHeader("Access-Control-Expose-Headers", "X-Total-Count");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization, Idempotency-Key");
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, PUT, PATCH, DELETE, OPTIONS");
  }
  if (req.method === "OPTIONS") { res.sendStatus(204); return; }
  if (!["GET", "HEAD"].includes(req.method) && req.cookies?.token && !origin && req.headers["sec-fetch-site"] === "cross-site") { res.sendStatus(403); return; }
  next();
});
app.post("/api/pagamentos/webhook", express.raw({ type: "application/json", limit: "1mb" }), paymentWebhook);
app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ extended: true, limit: "1mb" }));
app.use(optionalAuth);
app.use("/uploads/withdrawals", requireAuth, async (req, res, next) => {
  const url = `/uploads/withdrawals${req.path}`;
  const withdrawal = await prisma.retiradas.findFirst({ where: { fotos: { some: { url } } }, include: { alugueis: true } });
  const returned = withdrawal ? null : await prisma.devolucoes.findFirst({ where: { fotos: { array_contains: [url] } }, include: { aluguel: true } });
  const rental = withdrawal?.alugueis ?? returned?.aluguel;
  if (!rental || (req.user!.tipo !== "admin" && ![rental.locador_id, rental.locatario_id].includes(req.user!.id))) { res.status(404).json({ success: false, message: "Foto não encontrada" }); return; }
  res.setHeader("Cache-Control", "private, no-store");
  next();
});
app.use("/uploads", express.static(uploadsRoot, { maxAge: env.NODE_ENV === "dev" ? 0 : "7d" }));
app.use("/assets", express.static(frontendRoot, { maxAge: env.NODE_ENV === "dev" ? 0 : "1d" }));
app.use("/api", api);
app.use("/", web);
app.use(notFound);
app.use(errorHandler);

const server = process.env.VIZIN_NO_LISTEN === "true" ? null : app.listen(env.PORT, () => console.log(`Vizin disponível em ${env.APP_URL}`));

let maintenanceRunning=false;
const maintenance = server ? setInterval(() => {
 if(maintenanceRunning)return;
 maintenanceRunning=true;
 void maintainRentals(true).catch(error => console.error("Falha na manutenção de aluguéis", error)).finally(()=>{maintenanceRunning=false;});
}, 60000) : null;
maintenance?.unref();

async function shutdown(signal: string): Promise<void> {
  if (maintenance) clearInterval(maintenance);
  console.log(`Encerrando por ${signal}...`);
  server?.close(async () => {
    await prisma.$disconnect();
    process.exit(0);
  });
}
process.on("SIGINT", () => void shutdown("SIGINT"));
process.on("SIGTERM", () => void shutdown("SIGTERM"));

export default app;
