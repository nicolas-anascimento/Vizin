import type { RequestHandler } from "express";
import prisma from "../config/database.ts";
import { HttpError } from "../utils/httpError.ts";
import { audit, pagination } from "../utils/admin.ts";
import { text, uuid } from "../utils/validation.ts";

const statuses = ["aberta", "andamento", "resolvida", "fechada", "improcedente"];
const priorities = ["normal", "alta", "critica"];
const mapStatus = (value: string) => ({ aberto: "aberta", em_analise: "andamento", respondido: "resolvida", procedente: "resolvida" } as Record<string,string>)[value] ?? value;
const transitions: Record<string, readonly string[]> = {
  aberta: ["andamento", "resolvida", "fechada", "improcedente"],
  andamento: ["aberta", "resolvida", "fechada", "improcedente"],
  resolvida: ["andamento", "fechada"],
  fechada: ["andamento"],
  improcedente: ["andamento"],
};

function replyDto(row: any) { return { id: row.id, autor: row.admin, mensagem: row.mensagem, criado_em: row.criado_em }; }
function supportDto(row: any) {
  return { id: row.id, tipo: "suporte", denunciante: row.usuario, denunciado: null, motivo: row.assunto, descricao: row.mensagem, prioridade: row.prioridade, status: mapStatus(row.status), protocolo: row.protocolo, criado_em: row.criado_em, aluguel_id: null, produto_id: null, avaliacao_id: null, conversa_id: null, anexo: null, respostas: row.respostas.map(replyDto), motivo_improcedencia: row.motivo_improcedencia };
}
function reportDto(row: any) {
  const evidence = Array.isArray(row.evidencias) ? row.evidencias[0] : null;
  const evidenceUrl = typeof evidence === "string" && evidence.startsWith("/uploads/withdrawals/") ? evidence : evidence ? `/api/uploads/${evidence}` : null;
  return { id: row.id, tipo: "denuncia", denunciante: row.usuario, denunciado: row.denunciado, motivo: row.motivo, descricao: row.mensagem, prioridade: row.prioridade, status: mapStatus(row.status), protocolo: row.protocolo, criado_em: row.criado_em, aluguel_id: row.aluguel_id, produto_id: row.objeto_id, avaliacao_id: row.avaliacao_id, conversa_id: row.conversa_id, anexo: evidenceUrl ? { url: evidenceUrl, tipo: "privado" } : null, respostas: row.respostas.map(replyDto), motivo_improcedencia: row.motivo_improcedencia };
}
const supportInclude = { usuario: { select: { id: true, nome: true } }, respostas: { orderBy: { criado_em: "asc" as const }, include: { admin: { select: { id: true, nome: true } } } } };
const reportInclude = { usuario: { select: { id: true, nome: true } }, denunciado: { select: { id: true, nome: true } }, respostas: { orderBy: { criado_em: "asc" as const }, include: { admin: { select: { id: true, nome: true } } } } };

export const listOccurrences: RequestHandler = async (req, res) => {
  const { page, limit } = pagination(req);
  const kind = req.query.tipo === undefined ? undefined : String(req.query.tipo);
  if (kind && !["denuncia", "suporte"].includes(kind)) throw new HttpError(422, "Tipo inválido");
  const status = req.query.status === undefined ? undefined : String(req.query.status);
  if (status && !statuses.includes(status)) throw new HttpError(422, "Status inválido");
  const priority = req.query.prioridade === undefined ? undefined : String(req.query.prioridade);
  if (priority && !priorities.includes(priority)) throw new HttpError(422, "Prioridade inválida");
  const search = typeof req.query.busca === "string" && req.query.busca.trim() ? text(req.query.busca, "Busca", 100) : undefined;
  const statusValues = status ? [status, ...Object.entries({ aberto: "aberta", em_analise: "andamento", respondido: "resolvida", procedente: "resolvida" }).filter(([,v]) => v === status).map(([k]) => k)] : undefined;
  const [supports, reports] = await Promise.all([
    kind === "denuncia" ? [] : prisma.suportes.findMany({ where: { ...(statusValues ? { status: { in: statusValues } } : {}), ...(priority ? { prioridade: priority } : {}), ...(search ? { OR: [{ assunto: { contains: search, mode: "insensitive" } }, { mensagem: { contains: search, mode: "insensitive" } }, { protocolo: { contains: search, mode: "insensitive" } }] } : {}) }, include: supportInclude }),
    kind === "suporte" ? [] : prisma.denuncias.findMany({ where: { ...(statusValues ? { status: { in: statusValues } } : {}), ...(priority ? { prioridade: priority } : {}), ...(search ? { OR: [{ assunto: { contains: search, mode: "insensitive" } }, { mensagem: { contains: search, mode: "insensitive" } }, { protocolo: { contains: search, mode: "insensitive" } }] } : {}) }, include: reportInclude }),
  ]);
  const all = [...supports.map(supportDto), ...reports.map(reportDto)].sort((a,b) => b.criado_em.getTime() - a.criado_em.getTime());
  res.json({ data: all.slice((page - 1) * limit, page * limit), total: all.length });
};

async function findOccurrence(id: string) {
  const support = await prisma.suportes.findUnique({ where: { id }, include: supportInclude });
  if (support) return { kind: "suporte" as const, row: support, dto: supportDto(support) };
  const report = await prisma.denuncias.findUnique({ where: { id }, include: reportInclude });
  if (report) return { kind: "denuncia" as const, row: report, dto: reportDto(report) };
  throw new HttpError(404, "Ocorrência não encontrada");
}
export const getOccurrence: RequestHandler = async (req, res) => { res.json((await findOccurrence(uuid(req.params.id))).dto); };

export const updateOccurrenceStatus: RequestHandler = async (req, res) => {
  const id = uuid(req.params.id), status = text(req.body?.status, "Status", 20);
  if (!statuses.includes(status)) throw new HttpError(422, "Status inválido");
  const reason = status === "improcedente" ? text(req.body?.motivo, "Motivo", 1000) : null;
  if (status === "improcedente" && (!reason || reason.length < 5)) throw new HttpError(422, "O motivo deve ter ao menos 5 caracteres", "motivo_invalido");
  const found = await findOccurrence(id);
  const changed = await prisma.$transaction(async tx => {
    if (found.kind === "suporte") await tx.$queryRaw`SELECT id FROM suportes WHERE id=${id}::uuid FOR UPDATE`;
    else await tx.$queryRaw`SELECT id FROM denuncias WHERE id=${id}::uuid FOR UPDATE`;
    const current = found.kind === "suporte"
      ? await tx.suportes.findUniqueOrThrow({ where: { id } })
      : await tx.denuncias.findUniqueOrThrow({ where: { id } });
    const currentStatus = mapStatus(current.status);
    if (currentStatus === status) return false;
    if (!transitions[currentStatus]?.includes(status)) throw new HttpError(409, `Transição de ${currentStatus} para ${status} não permitida`, "transicao_invalida");
    if (found.kind === "suporte") await tx.suportes.update({ where: { id }, data: { status, motivo_improcedencia: reason } });
    else await tx.denuncias.update({ where: { id }, data: { status, motivo_improcedencia: reason } });
    await audit(tx, req.user!.id, status === "improcedente" ? "ocorrencia_improcedente" : "ocorrencia_status_alterado", found.kind, id, { status, motivo: reason });
    await tx.notificacoes.create({ data: { usuario_id: found.row.usuario_id, tipo: "ocorrencia_atualizada", titulo: "Ocorrência atualizada", mensagem: status === "improcedente" ? `Ocorrência considerada improcedente. Motivo: ${reason}` : `O status da ocorrência mudou para ${status}.`, contexto: { recursoId: id } } });
    await tx.notificacoes_admin.updateMany({ where: { referencia_tipo: "ocorrencia", referencia_id: id, tratada_em: null }, data: { tratado_por_id: req.user!.id, tratada_em: new Date() } });
    return true;
  });
  res.json({ success: true, alterado: changed, status, motivo_improcedencia: reason });
};

export const replyOccurrence: RequestHandler = async (req, res) => {
  const id = uuid(req.params.id), message = text(req.body?.mensagem, "Mensagem", 10000);
  const found = await findOccurrence(id);
  const reply = await prisma.$transaction(async tx => {
    const created = await tx.respostas_ocorrencia.create({ data: { admin_id: req.user!.id, mensagem: message, ...(found.kind === "suporte" ? { suporte_id: id } : { denuncia_id: id }) } });
    await tx.notificacoes.create({ data: { usuario_id: found.row.usuario_id, tipo: "resposta_suporte", titulo: "Nova resposta do suporte", mensagem: message.slice(0, 500), contexto: { recursoId: id } } });
    await audit(tx, req.user!.id, "ocorrencia_respondida", found.kind, id);
    return created;
  });
  res.status(201).json({ success: true, resposta: reply });
};

export const occurrenceSummary: RequestHandler = async (_req, res) => {
  const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const [reportsOpen, resolvedReports, resolvedSupports, supportCount, pendingReports, pendingSupports, criticalReports, criticalSupports] = await Promise.all([
    prisma.denuncias.count({ where: { status: { in: ["aberta", "aberto"] } } }), prisma.denuncias.count({ where: { status: { in: ["resolvida", "procedente", "fechada"] } } }), prisma.suportes.count({ where: { status: { in: ["resolvida", "respondido", "fechada"] } } }), prisma.suportes.count(), prisma.denuncias.count({ where: { status: { in: ["aberta", "aberto", "andamento", "em_analise"] } } }), prisma.suportes.count({ where: { status: { in: ["aberta", "aberto", "andamento", "em_analise"] } } }), prisma.denuncias.count({ where: { prioridade: "critica", criado_em: { lt: cutoff }, respostas: { none: {} }, status: { in: ["aberta", "aberto", "andamento", "em_analise"] } } }), prisma.suportes.count({ where: { prioridade: "critica", criado_em: { lt: cutoff }, respostas: { none: {} }, status: { in: ["aberta", "aberto", "andamento", "em_analise"] } } }),
  ]);
  res.json({ denuncias_abertas: reportsOpen, casos_resolvidos: resolvedReports + resolvedSupports, tickets_suporte: supportCount, total_pendentes: pendingReports + pendingSupports, criticas_sem_resposta_24h: criticalReports + criticalSupports });
};
