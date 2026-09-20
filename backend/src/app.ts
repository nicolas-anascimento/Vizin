import path from "node:path";
import fs from "node:fs";
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
import { uploadsRoot, privateWithdrawalRoot } from "./app/utils/files.ts";

// Ponto de entrada: configura segurança, API, arquivos estáticos, tarefas periódicas e encerramento.
const app = express();
const here = path.dirname(fileURLToPath(import.meta.url));
const frontendRoot = path.resolve(here, "../../frontend-mocks");

app.disable("x-powered-by");
app.set("trust proxy", env.TRUST_PROXY);
// Cabeçalhos limitam interpretação de conteúdo e recursos acessíveis pelo navegador.
const securityHeaders: RequestHandler = (_req, res, next) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  res.setHeader(
    "Permissions-Policy",
    `camera=(), microphone=(), geolocation=(self ${env.FRONTEND_ORIGINS.map((origin) => JSON.stringify(new URL(origin).origin)).join(" ")})`,
  );
  next();
};
app.use(cookieParser());
app.use(securityHeaders);
// Aceita apenas origens configuradas e valida Origin/Referer em mutações autenticadas por cookie.
app.use((req, res, next) => {
  const origin = req.headers.origin;
  if (origin && !env.FRONTEND_ORIGINS.includes(origin)) {
    res.status(403).json({ success: false, codigo: "origem_nao_permitida", message: "Origem não permitida", mensagem: "Origem não permitida" });
    return;
  }
  if (origin) {
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Vary", "Origin");
    res.setHeader("Access-Control-Allow-Credentials", "true");
    res.setHeader("Access-Control-Expose-Headers", "X-Total-Count");
    res.setHeader(
      "Access-Control-Allow-Headers",
      "Content-Type, Authorization, Idempotency-Key",
    );
    res.setHeader(
      "Access-Control-Allow-Methods",
      "GET, POST, PUT, PATCH, DELETE, OPTIONS",
    );
  }
  if (req.method === "OPTIONS") {
    res.sendStatus(204);
    return;
  }
  // Cookie em mutações exige Origin permitido; Bearer não está sujeito a CSRF.
  if (!["GET", "HEAD", "OPTIONS"].includes(req.method) && req.cookies?.token && !req.headers.authorization?.startsWith("Bearer ")) {
    const referer = req.headers.referer;
    let source = origin ?? null;
    if (!source && referer) { try { source = new URL(referer).origin; } catch { source = null; } }
    if (!source || !env.FRONTEND_ORIGINS.includes(source)) {
      res.status(403).json({ success: false, codigo: "csrf_origin", message: "Origem não permitida", mensagem: "Origem não permitida" });
      return;
    }
  }
  next();
});
// O webhook precisa do corpo bruto para autenticar sua assinatura antes do parser JSON.
app.post(
  "/api/pagamentos/webhook",
  express.raw({ type: "application/json", limit: "1mb" }),
  paymentWebhook,
);
app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ extended: true, limit: "1mb" }));
app.use(optionalAuth);
// Fotos de retirada e devolução são privadas: consulta o vínculo no banco antes de servir o arquivo.
app.get("/uploads/withdrawals/:name", requireAuth, async (req, res) => {
  const name = String(req.params.name);
  if (!/^(?:\d+-)?[0-9a-f]{8}-[0-9a-f-]{27,}\.?(?:jpg|jpeg|png|webp|gif)$/i.test(name)) {
    res.status(404).json({ success: false, codigo: "foto_nao_encontrada", message: "Foto não encontrada", mensagem: "Foto não encontrada" });
    return;
  }
  const url = `/uploads/withdrawals/${name}`;
  const withdrawal = await prisma.retiradas.findFirst({
    where: { fotos: { some: { url } } },
    include: { alugueis: true },
  });
  const returned = withdrawal
    ? null
    : await prisma.devolucoes.findFirst({
        where: { fotos: { array_contains: [url] } },
        include: { aluguel: true },
      });
  const rental = withdrawal?.alugueis ?? returned?.aluguel;
  if (
    !rental ||
    (req.user!.tipo !== "admin" &&
      ![rental.locador_id, rental.locatario_id].includes(req.user!.id))
  ) {
    res.status(404).json({ success: false, codigo: "foto_nao_encontrada", message: "Foto não encontrada", mensagem: "Foto não encontrada" });
    return;
  }
  res.setHeader("Cache-Control", "private, no-store");
  const current = path.join(privateWithdrawalRoot, name);
  const legacy = path.join(uploadsRoot, "withdrawals", name);
  const target = fs.existsSync(current) ? current : legacy;
  if (!fs.existsSync(target)) {
    res.status(404).json({ success: false, codigo: "foto_nao_encontrada", message: "Foto não encontrada", mensagem: "Foto não encontrada" });
    return;
  }
  res.sendFile(target);
});
for (const folder of ["items", "avatars"]) app.use(`/uploads/${folder}`, express.static(path.join(uploadsRoot, folder), { maxAge: env.NODE_ENV === "dev" ? 0 : "7d" }));
app.use(
  "/assets",
  express.static(frontendRoot, { maxAge: env.NODE_ENV === "dev" ? 0 : "1d" }),
);
// Conecta rotas da API e páginas; os handlers de erro ficam por último.
app.use("/api", api);
app.use("/", web);
app.use(notFound);
app.use(errorHandler);

const server =
  process.env.VIZIN_NO_LISTEN === "true"
    ? null
    : app.listen(env.PORT, () =>
        console.log(`Vizin disponível em ${env.APP_URL}`),
      );

// O intervalo de um minuto evita sobrepor duas execuções de manutenção no mesmo processo.
let maintenanceRunning = false;
const maintenance = server
  ? setInterval(() => {
      if (maintenanceRunning) return;
      maintenanceRunning = true;
      void maintainRentals(true)
        .catch((error) =>
          console.error("Falha na manutenção de aluguéis", error),
        )
        .finally(() => {
          maintenanceRunning = false;
        });
    }, 60000)
  : null;
maintenance?.unref();

// Interrompe o job e fecha a conexão do Prisma após o servidor parar de aceitar requisições.
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
