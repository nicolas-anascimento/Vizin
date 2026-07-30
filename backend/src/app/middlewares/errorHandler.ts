import type { ErrorRequestHandler, RequestHandler } from "express";
import multer from "multer";
import { HttpError } from "../utils/httpError.ts";
import env from "../config/env.ts";
import { cleanupRequestUploads } from "../utils/requestUploads.ts";

export const notFound: RequestHandler = (_req, res) => {
  res.status(404).json({ success: false, message: "Rota não encontrada" });
};

export const errorHandler: ErrorRequestHandler = (error, req, res, _next) => {
  void cleanupRequestUploads(req);
  if (error instanceof multer.MulterError) {
    res.status(422).json({ success: false, message: `Erro no upload: ${error.message}` });
    return;
  }
  if (error instanceof HttpError) {
    res.status(error.status).json({ success: false, message: error.message });
    return;
  }
  const prismaCode = typeof error === "object" && error !== null && "code" in error ? String((error as { code?: unknown }).code ?? "") : "";
  if (prismaCode === "P2002") {
    res.status(409).json({ success: false, message: "Já existe um registro com estes dados" });
    return;
  }
  if (prismaCode === "P2003") {
    res.status(409).json({ success: false, message: "Este registro ainda está relacionado a outros dados" });
    return;
  }
  if (prismaCode === "P2034") {
    res.status(409).json({ success: false, message: "A operação conflitou com outra requisição. Tente novamente." });
    return;
  }
  if (prismaCode === "P2025") {
    res.status(404).json({ success: false, message: "Registro não encontrado" });
    return;
  }
  const status = typeof error === "object" && error !== null && "status" in error ? Number((error as { status?: unknown }).status) : 0;
  if (status >= 400 && status < 600) {
    res.status(status).json({ success: false, message: error instanceof Error ? error.message : "Erro na requisição" });
    return;
  }
  const message = error instanceof Error ? error.message : "Erro interno";
  console.error(error);
  res.status(500).json({ success: false, message: "Erro interno do servidor", detail: env.NODE_ENV === "dev" ? message : undefined });
};
