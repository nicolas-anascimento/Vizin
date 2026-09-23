import jwt from "jsonwebtoken";
import type { ExtendedError } from "socket.io";
import prisma from "../app/config/database.ts";
import env from "../app/config/env.ts";
import type { RealtimeSocket } from "./socket.ts";

interface TokenPayload {
  id: string;
  email: string;
  tipo: "admin" | "usuario";
  tokenVersion: number;
}

function tokenFromCookies(header: string | undefined): string | null {
  if (!header) return null;
  for (const part of header.split(";")) {
    const [rawName, ...rawValue] = part.trim().split("=");
    if (rawName !== "token") continue;
    try {
      return decodeURIComponent(rawValue.join("="));
    } catch {
      return null;
    }
  }
  return null;
}

function bearer(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const token = value.startsWith("Bearer ") ? value.slice(7).trim() : value.trim();
  return token && token !== "null" && token !== "undefined" ? token : null;
}

export async function authenticateSocket(
  socket: RealtimeSocket,
  next: (error?: ExtendedError) => void,
): Promise<void> {
  try {
    const auth = socket.handshake.auth as Record<string, unknown>;
    const tokens = [
      bearer(auth.token),
      bearer(socket.handshake.headers.authorization),
      tokenFromCookies(socket.handshake.headers.cookie),
    ].filter((token, index, all): token is string =>
      Boolean(token) && all.indexOf(token) === index,
    );
    for (const token of tokens) {
      try {
        const payload = jwt.verify(token, env.JWT_KEY, {
          algorithms: ["HS256"],
        }) as TokenPayload;
        const user = await prisma.usuarios.findUnique({
          where: { id: payload.id },
          select: {
            id: true,
            email: true,
            tipo: true,
            ativo: true,
            token_version: true,
          },
        });
        if (!user?.ativo || user.token_version !== payload.tokenVersion) continue;
        socket.data.userId = user.id;
        socket.data.email = user.email;
        socket.data.role = user.tipo;
        next();
        return;
      } catch {
        // Um Bearer antigo não deve impedir o fallback para o cookie HttpOnly.
      }
    }
    throw new Error("Sessão inválida");
  } catch {
    const error = new Error("Autenticação do socket recusada") as ExtendedError;
    error.data = { code: "nao_autenticado" };
    next(error);
  }
}
