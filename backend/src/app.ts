import path from "node:path";
import { fileURLToPath } from "node:url";
import cookieParser from "cookie-parser";
import express, { type RequestHandler } from "express";
import env from "./app/config/env.ts";
import prisma from "./app/config/database.ts";
import { optionalAuth } from "./app/middlewares/auth.ts";
import { errorHandler, notFound } from "./app/middlewares/errorHandler.ts";
import api from "./app/routes/api.ts";
import web from "./app/routes/web.ts";
import { uploadsRoot } from "./app/utils/files.ts";

const app = express();
const here = path.dirname(fileURLToPath(import.meta.url));
const frontendRoot = path.resolve(here, "../../frontend");

app.disable("x-powered-by");
app.set("trust proxy", env.TRUST_PROXY);
const securityHeaders: RequestHandler = (_req, res, next) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  res.setHeader("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
  next();
};
app.use(securityHeaders);
app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ extended: true, limit: "1mb" }));
app.use(cookieParser());
app.use(optionalAuth);
app.use("/uploads", express.static(uploadsRoot, { maxAge: env.NODE_ENV === "dev" ? 0 : "7d" }));
app.use("/assets", express.static(frontendRoot, { maxAge: env.NODE_ENV === "dev" ? 0 : "1d" }));
app.use("/api", api);
app.use("/", web);
app.use(notFound);
app.use(errorHandler);

const server = app.listen(env.PORT, () => console.log(`Vizin disponível em ${env.APP_URL}`));

async function shutdown(signal: string): Promise<void> {
  console.log(`Encerrando por ${signal}...`);
  server.close(async () => {
    await prisma.$disconnect();
    process.exit(0);
  });
}
process.on("SIGINT", () => void shutdown("SIGINT"));
process.on("SIGTERM", () => void shutdown("SIGTERM"));

export default app;
