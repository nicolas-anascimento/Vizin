import crypto from "node:crypto";
import prisma from "../app/config/database.ts";
import { userRoom } from "./realtimeService.ts";
import type { RealtimeServer, RealtimeSocket } from "./socket.ts";

// Esta instância do servidor HTTP é também a única instância Socket.IO do projeto.
const connections = new Map<string, Set<string>>();
const offlineTimers = new Map<string, ReturnType<typeof setTimeout>>();
const generations = new Map<string, string>();
const OFFLINE_GRACE_MS = 750;

export function isUserOnline(userId: string): boolean {
  return (connections.get(userId)?.size ?? 0) > 0;
}

async function recipients(userId: string): Promise<string[]> {
  const memberships = await prisma.participantes_conversa.findMany({
    where: {
      usuario_id: { not: userId }, arquivada: false,
      conversa: { participantes: { some: { usuario_id: userId, arquivada: false } } },
    },
    select: { usuario_id: true }, distinct: ["usuario_id"],
  });
  const ids = memberships.map(row => row.usuario_id);
  if (!ids.length) return [];
  const blocked = await prisma.bloqueios.findMany({
    where: { OR: [
      { usuario_id: userId, bloqueado_id: { in: ids } },
      { usuario_id: { in: ids }, bloqueado_id: userId },
    ] },
    select: { usuario_id: true, bloqueado_id: true },
  });
  const denied = new Set(blocked.map(row => row.usuario_id === userId ? row.bloqueado_id : row.usuario_id));
  return ids.filter(id => !denied.has(id));
}

async function publish(io: RealtimeServer, userId: string, online: boolean, generation: string): Promise<void> {
  try {
    const ids = await recipients(userId);
    if (generations.get(userId) !== generation || isUserOnline(userId) !== online) return;
    for (const id of ids) io.to(userRoom(id)).emit("presence:update", { user_id: userId, online });
  } catch (error) {
    console.error("Falha ao publicar presença", error);
  } finally {
    if (!online && generations.get(userId) === generation && !isUserOnline(userId)) generations.delete(userId);
  }
}

export function trackPresence(io: RealtimeServer, socket: RealtimeSocket): void {
  // Contas suspensas não participam do chat e não anunciam presença.
  if (!socket.data.active) return;
  const userId = socket.data.userId;
  const timer = offlineTimers.get(userId);
  if (timer) { clearTimeout(timer); offlineTimers.delete(userId); }
  let ids = connections.get(userId);
  const wasOnline = !!ids?.size;
  if (!ids) { ids = new Set(); connections.set(userId, ids); }
  ids.add(socket.id);
  if (!wasOnline) {
    const generation = crypto.randomUUID();
    generations.set(userId, generation);
    void publish(io, userId, true, generation);
  }
  socket.once("disconnect", () => {
    const current = connections.get(userId);
    if (!current?.delete(socket.id) || current.size) return;
    connections.delete(userId);
    const generation = crypto.randomUUID();
    generations.set(userId, generation);
    // Evita piscar offline durante refresh; um reconnect cancela a transição.
    offlineTimers.set(userId, setTimeout(() => {
      offlineTimers.delete(userId);
      if (!isUserOnline(userId)) void publish(io, userId, false, generation);
    }, OFFLINE_GRACE_MS));
  });
}
