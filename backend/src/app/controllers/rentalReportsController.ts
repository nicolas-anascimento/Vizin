import crypto from "node:crypto";
import type { RequestHandler } from "express";
import prisma from "../config/database.ts";
import { HttpError } from "../utils/httpError.ts";
import { text, uuid } from "../utils/validation.ts";

const stages = ["retirada", "devolucao"];
const reasons = ["objeto_diferente", "objeto_danificado", "objeto_incompleto", "outra_parte_ausente", "outro"];

// Valida etapa e motivo e usa uma chave estável para evitar relato duplicado da mesma pessoa.
async function openReport(userId: string, rentalId: string, stage: string, reason: string, description: string) {
  if (!stages.includes(stage) || !reasons.includes(reason)) throw new HttpError(422, "Etapa ou motivo inválido", "relato_invalido");
  const key = crypto.createHash("sha256").update(`${rentalId}:${userId}:${stage}:${reason}`).digest("hex");
  // Bloqueia o aluguel enquanto confirma participação, estado da etapa e cobrança de multa.
  // A contestação altera a multa e registra o evento junto com o relato e a notificação.
  return prisma.$transaction(async tx => {
    await tx.$queryRaw`SELECT id FROM alugueis WHERE id=${rentalId}::uuid FOR UPDATE`;
    const rental = await tx.alugueis.findUnique({ where: { id: rentalId } });
    if (!rental) throw new HttpError(404, "Solicitação não encontrada", "nao_encontrada");
    if (![rental.locatario_id, rental.locador_id].includes(userId)) throw new HttpError(403, "Acesso negado", "nao_pertence");
    if (stage === "retirada" && !["pago", "retirado"].includes(rental.status ?? "")) throw new HttpError(409, "Etapa de retirada indisponível", "etapa_indisponivel");
    if (stage === "devolucao" && !["retirado", "devolvido", "finalizado"].includes(rental.status ?? "")) throw new HttpError(409, "Etapa de devolução indisponível", "etapa_indisponivel");
    const existing = await tx.denuncias.findUnique({ where: { relato_chave: key } });
    if (existing) return existing;
    const created = await tx.denuncias.create({ data: { usuario_id: userId, denunciado_id: rental.locatario_id === userId ? rental.locador_id : rental.locatario_id, objeto_id: rental.item_id, aluguel_id: rentalId, etapa: stage, relato_chave: key, motivo: reason, assunto: `Relato de ${stage}`, mensagem: description, protocolo: `VIZIN-${crypto.randomUUID()}` } });
    const target = rental.locatario_id === userId ? rental.locador_id : rental.locatario_id;
    await tx.notificacoes.create({ data: { usuario_id: target, tipo: "problema_reportado", titulo: "Problema reportado", mensagem: "A outra parte abriu um relato para esta solicitação.", contexto: { solicitacao_id: rentalId, relato_id: created.id } } });
    return created;
  });
}

// Aceita a rota específica de contestação de multa e a rota geral de relatos; devolve o protocolo.
export const createRentalReport: RequestHandler = async (req, res) => {
  const id = uuid(req.params.id ?? req.body?.solicitacao_id);
  const stage = text(req.body?.etapa, "Etapa", 20);
  const reason = text(req.body?.motivo, "Motivo", 50);
  const description = text(req.body?.descricao, "Descrição", 10000);
  const report = await openReport(req.user!.id, id, stage, reason, description);
  res.status(201).json({ id: report.id, solicitacao_id: id, etapa: report.etapa, motivo: report.motivo, descricao: report.mensagem, status: report.status, protocolo: report.protocolo });
};
// Lista relatos de uma solicitação apenas para locador ou locatário, em ordem cronológica.
export const listRentalReports: RequestHandler = async (req, res) => {
  const id = uuid(req.params.id);
  const rental = await prisma.alugueis.findUnique({ where: { id }, select: { locador_id: true, locatario_id: true } });
  if (!rental) throw new HttpError(404, "Solicitação não encontrada", "nao_encontrada");
  if (![rental.locador_id, rental.locatario_id].includes(req.user!.id)) throw new HttpError(403, "Acesso negado", "nao_pertence");
  const rows = await prisma.denuncias.findMany({ where: { aluguel_id: id, etapa: { not: null } }, orderBy: { criado_em: "asc" }, select: { id: true, usuario_id: true, etapa: true, motivo: true, mensagem: true, status: true, resposta_usuario: true, criado_em: true } });
  res.json(rows.map(row => ({ id: row.id, solicitacao_id: id, autor_id: row.usuario_id, etapa: row.etapa, motivo: row.motivo, descricao: row.mensagem, status: row.status, resposta_usuario: row.resposta_usuario, criado_em: row.criado_em })));
};
