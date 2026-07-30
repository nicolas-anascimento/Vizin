import type { RequestHandler } from "express";
import prisma from "../config/database.ts";
import { HttpError } from "../utils/httpError.ts";
import { serializeNotification } from "../utils/serializers.ts";
import { asBoolean } from "../utils/strings.ts";

export const listNotifications: RequestHandler = async (req, res) => {
  const rows = await prisma.notificacoes.findMany({ where: { usuario_id: req.user!.id }, orderBy: { criado_em: "desc" }, take: 100 });
  res.json(rows.map(serializeNotification));
};

export const markNotification: RequestHandler = async (req, res) => {
  const found = await prisma.notificacoes.findUnique({ where: { id: req.params.id } });
  if (!found) throw new HttpError(404, "Notificação não encontrada");
  if (found.usuario_id !== req.user!.id) throw new HttpError(403, "Acesso negado");
  const updated = await prisma.notificacoes.update({ where: { id: found.id }, data: { lida: asBoolean(req.body?.lida, true) } });
  res.json({ success: true, ...serializeNotification(updated) });
};

export const deleteNotification: RequestHandler = async (req, res) => {
  const found = await prisma.notificacoes.findUnique({ where: { id: req.params.id } });
  if (!found) throw new HttpError(404, "Notificação não encontrada");
  if (found.usuario_id !== req.user!.id) throw new HttpError(403, "Acesso negado");
  await prisma.notificacoes.delete({ where: { id: found.id } });
  res.json({ success: true });
};
