import type { NextFunction, Request, Response } from "express";
import jwt from "jsonwebtoken";
import env from "../config/env.ts";
import prisma from "../config/database.ts";

// O token carrega identidade, papel e versão; o banco permanece a fonte de verdade da sessão.
type TokenPayload = { id: string; email: string; tipo: "admin" | "usuario"; tokenVersion: number };

// Aceita Bearer para clientes de API e cookie para o navegador.
function getToken(req: Request): string | null {
  const authorization = req.headers.authorization;
  if (authorization?.startsWith("Bearer ")) {
    const token = authorization.slice(7).trim();
    return token && token !== "null" && token !== "undefined" ? token : null;
  }
  const cookieToken = req.cookies?.token;
  if (typeof cookieToken === "string" && cookieToken) return cookieToken;
  return null;
}

// Verifica assinatura HS256 e conta ativa; token ausente ou inválido segue como visitante.
export async function optionalAuth(req: Request, _res: Response, next: NextFunction): Promise<void> {
  const token = getToken(req);
  if (!token) {
    next();
    return;
  }
  try {
    const payload = jwt.verify(token, env.JWT_KEY, { algorithms: ["HS256"] }) as TokenPayload;
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

// Impede que a requisição chegue ao controller sem usuário autenticado.
export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  if (!req.user) {
    res.status(401).json({ success: false, codigo: "nao_autenticado", message: "Faça login para continuar", mensagem: "Faça login para continuar" });
    return;
  }
  next();
}

// Exige sessão válida e papel de administrador antes das rotas administrativas.
export function requireAdmin(req: Request, res: Response, next: NextFunction): void {
  if (!req.user) {
    res.status(401).json({ success: false, codigo: "nao_autenticado", message: "Faça login para continuar", mensagem: "Faça login para continuar" });
    return;
  }
  if (req.user.tipo !== "admin") {
    res.status(403).json({ success: false, codigo: "admin_required", message: "Acesso restrito a administradores", mensagem: "Acesso restrito a administradores" });
    return;
  }
  next();
}

// Direciona visitantes ao login antes de abrir páginas restritas.
export function requireAuthPage(req: Request, res: Response, next: NextFunction): void {
  if (!req.user) {
    res.redirect("/login");
    return;
  }
  next();
}

// Direciona quem não é administrador para a página apropriada.
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
