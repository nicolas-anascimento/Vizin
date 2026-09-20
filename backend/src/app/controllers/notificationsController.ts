import { uuid } from "../utils/validation.ts";
import type { RequestHandler } from "express";
import prisma from "../config/database.ts";
import { HttpError } from "../utils/httpError.ts";
import { serializeNotification } from "../utils/serializers.ts";
import { asBoolean } from "../utils/strings.ts";
import { pageHeaders, pagination } from "../utils/listPage.ts";

// Consulta notificações do usuário autenticado e transforma os registros para a API.
export const listNotifications: RequestHandler = async (req, res) => {
  const {page,limit,skip}=pagination(req);
  const since = req.query.desde;
  if (since !== undefined && (typeof since !== "string" || !/^\d{4}-\d{2}-\d{2}T.*(?:Z|[+-]\d{2}:\d{2})$/.test(since) || !Number.isFinite(new Date(since).getTime()))) throw new HttpError(422, "Instante inválido", "data_invalida");
  // O filtro por usuário vale tanto para a página quanto para o total;
  // o parâmetro desde permite buscar apenas notificações novas.
  const where={usuario_id:req.user!.id,...(since ? { criado_em: { gt: new Date(since) } } : {})};
  const [rows,total]=await Promise.all([prisma.notificacoes.findMany({ where, orderBy: { criado_em: "desc" }, skip,take:limit }),prisma.notificacoes.count({where})]);
  pageHeaders(res,total,page,limit);
  res.json(rows.map(serializeNotification));
};

// Conta apenas notificações não lidas do usuário, para o indicador da interface.
export const unreadCount: RequestHandler = async (req, res) => {
  res.json({ quantidade: await prisma.notificacoes.count({ where: { usuario_id: req.user!.id, lida: false } }) });
};

// Marca como lida apenas uma notificação pertencente ao usuário autenticado.
export const markNotification: RequestHandler = async (req, res) => {
  const found = await prisma.notificacoes.findUnique({ where: { id: uuid(req.params.id) } });
  if (!found) throw new HttpError(404, "Notificação não encontrada");
  if (found.usuario_id !== req.user!.id) throw new HttpError(403, "Acesso negado");
  // O campo lida aceita o booleano validado; a checagem de dono evita alterar aviso alheio.
  const updated = await prisma.notificacoes.update({ where: { id: found.id }, data: { lida: asBoolean(req.body?.lida, true) } });
  res.json({ success: true, ...serializeNotification(updated) });
};

// Exclui somente uma notificação do próprio usuário.
export const deleteNotification: RequestHandler = async (req, res) => {
  const found = await prisma.notificacoes.findUnique({ where: { id: uuid(req.params.id) } });
  if (!found) throw new HttpError(404, "Notificação não encontrada");
  if (found.usuario_id !== req.user!.id) throw new HttpError(403, "Acesso negado");
  await prisma.notificacoes.delete({ where: { id: found.id } });
  res.json({ success: true });
};
