import type { NextFunction, Request, Response } from "express";
import jwt from "jsonwebtoken";
import env from "../config/env.ts";
import prisma from "../config/database.ts";

type TokenPayload = { id: string; email: string; tipo: "admin" | "usuario"; tokenVersion: number };

function getToken(req: Request): string | null {
  const authorization = req.headers.authorization;
  if (authorization?.startsWith("Bearer ")) {
    const token = authorization.slice(7).trim();
    if (token && token !== "null" && token !== "undefined") return token;
  }
  const cookieToken = req.cookies?.token;
  if (typeof cookieToken === "string" && cookieToken) return cookieToken;
  return null;
}

export async function optionalAuth(req: Request, _res: Response, next: NextFunction): Promise<void> {
  const token = getToken(req);
  if (!token) {
    next();
    return;
  }
  try {
    const payload = jwt.verify(token, env.JWT_KEY) as TokenPayload;
    const user = await prisma.usuarios.findUnique({
      where: { id: payload.id },
      select: { id: true, email: true, tipo: true, ativo: true, token_version: true },
    });
    if (user?.ativo && user.token_version === payload.tokenVersion) req.user = { id: user.id, email: user.email, tipo: user.tipo };
  } catch {
    // Sessão inválida é tratada como usuário não autenticado.
  }
  next();
}

export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  if (!req.user) {
    res.status(401).json({ success: false, message: "Faça login para continuar" });
    return;
  }
  next();
}

export function requireAdmin(req: Request, res: Response, next: NextFunction): void {
  if (!req.user) {
    res.status(401).json({ success: false, message: "Faça login para continuar" });
    return;
  }
  if (req.user.tipo !== "admin") {
    res.status(403).json({ success: false, message: "Acesso restrito a administradores" });
    return;
  }
  next();
}

export function requireAuthPage(req: Request, res: Response, next: NextFunction): void {
  if (!req.user) {
    res.redirect("/login");
    return;
  }
  next();
}

export function requireAdminPage(req: Request, res: Response, next: NextFunction): void {
  if (!req.user) {
    res.redirect("/login");
    return;
  }
  if (req.user.tipo !== "admin") {
    res.redirect("/home");
    return;
  }
  next();
}
