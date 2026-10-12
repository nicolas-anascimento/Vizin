import type { RequestHandler } from "express";
import prisma from "../config/database.ts";
import { HttpError } from "../utils/httpError.ts";
import { pagination } from "../utils/admin.ts";
import { boolean, text, uuid } from "../utils/validation.ts";
import { businessDayStart, businessDate } from "../utils/dates.ts";

export const ADMIN_NOTIFICATION_CATEGORIES = ["usuarios", "anuncios", "denuncias", "pagamentos", "avaliacoes", "verificacoes", "sistema"] as const;
const defaults = Object.fromEntries(ADMIN_NOTIFICATION_CATEGORIES.map(category => [category, true]));
async function preferences(adminId: string) {
  const row = await prisma.notificacoes_admin_preferencias.findUnique({ where: { admin_id: adminId } });
  return { categorias: { ...defaults, ...(row?.categorias as Record<string,boolean> ?? {}) }, somente_urgentes: row?.somente_urgentes ?? false };
}
function visibleWhere(adminId: string, prefs: Awaited<ReturnType<typeof preferences>>) {
  const enabled = ADMIN_NOTIFICATION_CATEGORIES.filter(category => prefs.categorias[category] !== false);
  return { estados: { none: { admin_id: adminId, dispensada: true } }, ...(prefs.somente_urgentes ? { prioridade: "alta" } : enabled.length === ADMIN_NOTIFICATION_CATEGORIES.length ? {} : { OR: [{ prioridade: "alta" }, { categoria: { in: enabled } }] }) };
}
function dto(row: any, adminId: string) {
  const state = row.estados.find((item: any) => item.admin_id === adminId);
  return { id: row.id, tipo: row.tipo, categoria: row.categoria, prioridade: row.prioridade, titulo: row.titulo, mensagem: row.mensagem, lida: state?.lida ?? false, criado_em: row.criado_em, referencia: row.referencia_id ? { tipo: row.referencia_tipo, id: row.referencia_id } : null, tratada_por: row.tratado_por, tratada_em: row.tratada_em };
}
export const listAdminNotifications: RequestHandler = async (req, res) => {
  const { limit, skip } = pagination(req, 15), adminId = req.user!.id;
  const prefs = await preferences(adminId);
  const category = req.query.categoria === undefined ? undefined : String(req.query.categoria);
  if (category && !ADMIN_NOTIFICATION_CATEGORIES.includes(category as any)) throw new HttpError(422, "Categoria inválida");
  const priority = req.query.prioridade === undefined ? undefined : String(req.query.prioridade);
  if (priority && !["normal", "alta"].includes(priority)) throw new HttpError(422, "Prioridade inválida");
  const read = req.query.lida === undefined ? undefined : boolean(req.query.lida, "Lida");
  const search = typeof req.query.busca === "string" && req.query.busca.trim() ? text(req.query.busca, "Busca", 100) : undefined;
  const where: any = { AND: [visibleWhere(adminId, prefs), ...(category ? [{ categoria: category }] : []), ...(priority ? [{ prioridade: priority }] : []), ...(search ? [{ OR: [{ titulo: { contains: search, mode: "insensitive" } }, { mensagem: { contains: search, mode: "insensitive" } }] }] : []), ...(read === true ? [{ estados: { some: { admin_id: adminId, lida: true, dispensada: false } } }] : read === false ? [{ estados: { none: { admin_id: adminId, OR: [{ lida: true }, { dispensada: true }] } } }] : []) ] };
  const [rows,total] = await Promise.all([prisma.notificacoes_admin.findMany({ where, orderBy: { criado_em: "desc" }, skip, take: limit, include: { estados: { where: { admin_id: adminId } }, tratado_por: { select: { id: true, nome: true } } } }), prisma.notificacoes_admin.count({ where })]);
  res.json({ data: rows.map(row => dto(row, adminId)), total });
};
export const adminNotificationSummary: RequestHandler = async (req, res) => {
  const adminId = req.user!.id, prefs = await preferences(adminId), base: any = visibleWhere(adminId, prefs);
  const unread = { AND: [base, { estados: { none: { admin_id: adminId, OR: [{ lida: true }, { dispensada: true }] } } }] };
  const today = businessDayStart(businessDate());
  const [notRead, urgent, todayCount, ...categories] = await Promise.all([prisma.notificacoes_admin.count({ where: unread }), prisma.notificacoes_admin.count({ where: { ...unread, prioridade: "alta" } }), prisma.notificacoes_admin.count({ where: { ...base, criado_em: { gte: today } } }), ...ADMIN_NOTIFICATION_CATEGORIES.map(categoria => prisma.notificacoes_admin.count({ where: { ...unread, categoria } }))]);
  res.json({ nao_lidas: notRead, urgentes_nao_lidas: urgent, recebidas_hoje: todayCount, por_categoria: Object.fromEntries(ADMIN_NOTIFICATION_CATEGORIES.map((key,index) => [key,categories[index]])) });
};
export const markAdminNotification: RequestHandler = async (req, res) => {
  const id = uuid(req.params.id), lida = boolean(req.body?.lida, "Lida");
  if (!await prisma.notificacoes_admin.findUnique({ where: { id }, select: { id: true } })) throw new HttpError(404, "Notificação não encontrada");
  const state = await prisma.notificacoes_admin_estado.upsert({ where: { notificacao_id_admin_id: { notificacao_id: id, admin_id: req.user!.id } }, create: { notificacao_id: id, admin_id: req.user!.id, lida, lida_em: lida ? new Date() : null }, update: { lida, lida_em: lida ? new Date() : null } });
  res.json({ success: true, lida: state.lida });
};
export const dismissAdminNotification: RequestHandler = async (req, res) => {
  const id = uuid(req.params.id);
  if (!await prisma.notificacoes_admin.findUnique({ where: { id }, select: { id: true } })) throw new HttpError(404, "Notificação não encontrada");
  await prisma.notificacoes_admin_estado.upsert({ where: { notificacao_id_admin_id: { notificacao_id: id, admin_id: req.user!.id } }, create: { notificacao_id: id, admin_id: req.user!.id, lida: true, dispensada: true, lida_em: new Date(), dispensada_em: new Date() }, update: { lida: true, dispensada: true, lida_em: new Date(), dispensada_em: new Date() } });
  res.json({ success: true });
};
export const markAllAdminNotifications: RequestHandler = async (req, res) => {
  const category = req.body?.categoria;
  if (category !== undefined && !ADMIN_NOTIFICATION_CATEGORIES.includes(category)) throw new HttpError(422, "Categoria inválida");
  const prefs = await preferences(req.user!.id);
  const rows = await prisma.notificacoes_admin.findMany({ where: { ...visibleWhere(req.user!.id, prefs), ...(category ? { categoria: category } : {}) }, select: { id: true } });
  if (rows.length) await prisma.notificacoes_admin_estado.createMany({ data: rows.map(row => ({ notificacao_id: row.id, admin_id: req.user!.id, lida: true, lida_em: new Date() })), skipDuplicates: true });
  await prisma.notificacoes_admin_estado.updateMany({ where: { admin_id: req.user!.id, notificacao_id: { in: rows.map(row => row.id) }, lida: false }, data: { lida: true, lida_em: new Date() } });
  res.json({ atualizadas: rows.length });
};
export const getAdminNotificationPreferences: RequestHandler = async (req,res) => { res.json(await preferences(req.user!.id)); };
export const putAdminNotificationPreferences: RequestHandler = async (req,res) => {
  if (!req.body?.categorias || typeof req.body.categorias !== "object" || Array.isArray(req.body.categorias)) throw new HttpError(422, "Categorias inválidas");
  const categories: Record<string,boolean> = {};
  for (const category of ADMIN_NOTIFICATION_CATEGORIES) categories[category] = boolean(req.body.categorias[category], category);
  const urgent = boolean(req.body?.somente_urgentes, "somente_urgentes");
  await prisma.notificacoes_admin_preferencias.upsert({ where: { admin_id: req.user!.id }, create: { admin_id: req.user!.id, categorias: categories, somente_urgentes: urgent }, update: { categorias: categories, somente_urgentes: urgent } });
  res.json({ categorias: categories, somente_urgentes: urgent });
};
