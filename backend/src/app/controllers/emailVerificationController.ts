import type { RequestHandler } from "express";
import prisma from "../config/database.ts";
import { HttpError } from "../utils/httpError.ts";
import { verificationHash, verificationMessage } from "../services/emailVerification.ts";
import { wakeEmailOutbox } from "../services/emailOutbox.ts";
import { tokenSchema } from "../schemas/common.ts";

export const confirmEmailAddress: RequestHandler = async (req, res) => {
  const parsed = tokenSchema.safeParse(req.body?.token);
  if (!parsed.success) throw new HttpError(400, "Link inválido ou expirado");
  const token = parsed.data;
  const hash = verificationHash(token);
  await prisma.$transaction(async tx => {
    const row = await tx.tokens_verificacao_email.findUnique({ where: { token_hash: hash } });
    if (!row) throw new HttpError(400, "Link inválido ou expirado");
    const consumed = await tx.tokens_verificacao_email.deleteMany({ where: { token_hash: hash, expira_em: { gt: new Date() } } });
    if (consumed.count !== 1) throw new HttpError(400, "Link inválido ou expirado");
    await tx.usuarios.update({ where: { id: row.usuario_id }, data: { email_verificado: true } });
  }).catch((error: unknown) => {
    if (typeof error === "object" && error !== null && "code" in error && error.code === "P2034") throw new HttpError(400, "Link inválido ou expirado");
    throw error;
  });
  res.json({ success: true, email_verificado: true });
};

export const resendEmailVerification: RequestHandler = async (req, res) => {
  const id = req.user!.id;
  const enqueued = await prisma.$transaction(async tx => {
    const user = await tx.usuarios.findUniqueOrThrow({ where: { id }, select: { id: true, nome: true, email: true, email_verificado: true } });
    if (user.email_verificado) return false;
    const pending = await tx.tokens_verificacao_email.findUnique({ where: { usuario_id: id } });
    if (pending && pending.criado_em.getTime() > Date.now() - 60_000) throw new HttpError(429, "Aguarde um minuto antes de reenviar");
    const message = verificationMessage(user);
    await tx.email_outbox.updateMany({ where: { tipo: "verificacao_email", destinatario: user.email, status: "pendente" }, data: { status: "cancelado", payload: {} } });
    await tx.tokens_verificacao_email.upsert({ where: { usuario_id: id }, create: { usuario_id: id, token_hash: message.token_hash, expira_em: message.expira_em }, update: { token_hash: message.token_hash, expira_em: message.expira_em, criado_em: new Date() } });
    await tx.email_outbox.create({ data: message.outbox });
    return true;
  }, { isolationLevel: "Serializable" }).catch((error: unknown) => {
    if (typeof error === "object" && error !== null && "code" in error && error.code === "P2034") throw new HttpError(429, "Aguarde um minuto antes de reenviar");
    throw error;
  });
  if (enqueued) wakeEmailOutbox();
  res.status(202).json({ success: true, message: "Se a conta precisar de confirmação, a solicitação foi registrada." });
};
