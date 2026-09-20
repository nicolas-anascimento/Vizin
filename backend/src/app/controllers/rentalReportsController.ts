import crypto from "node:crypto";
import type { RequestHandler } from "express";
import prisma from "../config/database.ts";
import { HttpError } from "../utils/httpError.ts";
import { text, uuid } from "../utils/validation.ts";
import { audit } from "../utils/admin.ts";

const stages = ["retirada", "devolucao", "multa"];
const reasons = ["objeto_diferente", "objeto_danificado", "objeto_incompleto", "outra_parte_ausente", "multa_indevida", "outro"];

// Valida etapa e motivo e usa uma chave estável para evitar relato duplicado da mesma pessoa.
async function openReport(userId: string, rentalId: string, stage: string, reason: string, description: string) {
  if (!stages.includes(stage) || !reasons.includes(reason)) throw new HttpError(422, "Etapa ou motivo inválido", "relato_invalido");
  const key = crypto.createHash("sha256").update(`${rentalId}:${userId}:${stage}:${reason}`).digest("hex");
  // Bloqueia o aluguel enquanto confirma participação, estado da etapa e cobrança de multa.
  // A contestação altera a multa e registra o evento junto com o relato e a notificação.
  return prisma.$transaction(async tx => {
    await tx.$queryRaw`SELECT id FROM alugueis WHERE id=${rentalId}::uuid FOR UPDATE`;
    const rental = await tx.alugueis.findUnique({ where: { id: rentalId }, include: { multa: true } });
    if (!rental) throw new HttpError(404, "Solicitação não encontrada", "nao_encontrada");
    if (![rental.locatario_id, rental.locador_id].includes(userId)) throw new HttpError(403, "Acesso negado", "nao_pertence");
    if (stage === "multa" && userId !== rental.locatario_id) throw new HttpError(403, "Somente o locatário pode contestar a multa", "nao_pertence");
    if (stage === "multa" && !rental.multa) throw new HttpError(409, "Multa não encontrada", "sem_multa");
    if (stage === "multa" && rental.multa?.status === "paga") throw new HttpError(409, "Multa já paga", "ja_paga");
    if (stage === "multa" && await tx.pagamentos.count({ where: { aluguel_id: rentalId, tipo: "multa", status: { in: ["pendente", "pago", "cancelamento_pendente", "estorno_pendente"] } } })) throw new HttpError(409, "Aguarde o cancelamento da cobrança antes de contestar", "pagamento_em_andamento");
    if (stage === "retirada" && !["pago", "retirado"].includes(rental.status ?? "")) throw new HttpError(409, "Etapa de retirada indisponível", "etapa_indisponivel");
    if (stage === "devolucao" && !["retirado", "devolvido", "finalizado"].includes(rental.status ?? "")) throw new HttpError(409, "Etapa de devolução indisponível", "etapa_indisponivel");
    const existing = await tx.denuncias.findUnique({ where: { relato_chave: key } });
    if (existing) return existing;
    const created = await tx.denuncias.create({ data: { usuario_id: userId, denunciado_id: rental.locatario_id === userId ? rental.locador_id : rental.locatario_id, objeto_id: rental.item_id, aluguel_id: rentalId, etapa: stage, relato_chave: key, motivo: reason, assunto: `Relato de ${stage}`, mensagem: description, protocolo: `VIZIN-${crypto.randomUUID()}` } });
    if (stage === "multa") {
      await tx.multas_aluguel.updateMany({ where: { aluguel_id: rentalId, status: "pendente" }, data: { status: "contestada" } });
      await tx.eventos_aluguel.create({ data: { aluguel_id: rentalId, usuario_id: userId, status: "multa_contestada", motivo: reason } });
    }
    const target = rental.locatario_id === userId ? rental.locador_id : rental.locatario_id;
    await tx.notificacoes.create({ data: { usuario_id: target, tipo: stage === "multa" ? "multa_contestada" : "problema_reportado", titulo: stage === "multa" ? "Multa contestada" : "Problema reportado", mensagem: "A outra parte abriu um relato para esta solicitação.", contexto: { solicitacao_id: rentalId, relato_id: created.id } } });
    return created;
  });
}

// Aceita a rota específica de contestação de multa e a rota geral de relatos; devolve o protocolo.
export const createRentalReport: RequestHandler = async (req, res) => {
  const id = uuid(req.params.id ?? req.body?.solicitacao_id);
  const stage = text(req.params.id ? "multa" : req.body?.etapa, "Etapa", 20);
  const reason = text(req.params.id ? "multa_indevida" : req.body?.motivo, "Motivo", 50);
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

// Permite ao administrador reabrir multa contestada, com atualização condicional e auditoria.
export const resolveFine: RequestHandler = async (req, res) => {
  const id = uuid(req.params.id);
  const action = text(req.body?.status, "Status", 30);
  if (action !== "pendente") throw new HttpError(422, "Apenas reabrir como pendente é permitido", "status_invalido");
  const reason = text(req.body?.motivo, "Motivo", 1000);
  const fine = await prisma.$transaction(async tx => {
    const current = await tx.multas_aluguel.findUnique({ where: { aluguel_id: id } });
    if (!current) throw new HttpError(404, "Multa não encontrada", "sem_multa");
    if (current.status === "pendente") return current;
    if (current.status !== "contestada") throw new HttpError(409, "Multa já encerrada", "multa_encerrada");
    const changed = await tx.multas_aluguel.updateMany({ where: { aluguel_id: id, status: "contestada" }, data: { status: "pendente" } });
    if (!changed.count) throw new HttpError(409, "Decisão concorrente", "decisao_concorrente");
    await audit(tx, req.user!.id, "reabrir_multa", "multa", id, { motivo: reason });
    return tx.multas_aluguel.findUniqueOrThrow({ where: { aluguel_id: id } });
  });
  res.json({ solicitacao_id: id, status: fine.status, valor_total: Number(fine.valor_total) });
};
