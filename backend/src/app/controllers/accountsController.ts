import type { RequestHandler } from "express";
import bcrypt from "bcrypt";
import { createHash, randomBytes } from "node:crypto";
import prisma from "../config/database.ts";
import env from "../config/env.ts";
import { HttpError } from "../utils/httpError.ts";
import { password } from "../utils/validation.ts";
import { wakeEmailOutbox } from "../services/emailOutbox.ts";
import { tokenSchema } from "../schemas/common.ts";
import { recoverySchema } from "../schemas/auth.schema.ts";
import { validatedPart } from "../middlewares/validate.ts";

export const validateResetToken: RequestHandler = async (req, res) => {
  const parsed = tokenSchema.safeParse(req.body?.token);
  if (!parsed.success) throw new HttpError(400, "Token inválido ou expirado");
  const token = parsed.data;
  const found = await prisma.resetar_Senha.findUnique({ where: { token: createHash("sha256").update(token).digest("hex") } });
  if (!found || found.expire_in <= new Date()) throw new HttpError(400, "Token inválido ou expirado");
  res.json({ valido: true });
};

// Gera token temporário de redefinição e solicita envio ao email cadastrado.
export const requestResetPassword: RequestHandler = async (req, res) => {
  const { email } = validatedPart(req, "body", recoverySchema);
  const user = await prisma.usuarios.findUnique({ where: { email } });
  if (user) {
    const token = randomBytes(32).toString("hex");
    const tokenHash = createHash("sha256").update(token).digest("hex");
    const url = `${env.APP_URL.replace(/\/$/, "")}/resetar-senha?token=${token}`;
    await prisma.$transaction(async tx => {
      await tx.email_outbox.updateMany({ where: { tipo: "recuperacao_senha", destinatario: email, status: "pendente" }, data: { status: "cancelado", payload: {} } });
      await tx.resetar_Senha.deleteMany({ where: { userId: user.id } });
      await tx.resetar_Senha.create({ data: { userId: user.id, token: tokenHash, expire_in: new Date(Date.now() + 60 * 60 * 1000) } });
      await tx.email_outbox.create({ data: { tipo: "recuperacao_senha", destinatario: email, chave: `recuperacao:${user.id}:${tokenHash}`, payload: { subject: "Recuperação de senha - Vizin", text: `Use este link para redefinir sua senha (válido por 1 hora): ${url}` } } });
    });
    wakeEmailOutbox();
  }
  res.json({ success: true, message: "Se o usuário existir, enviaremos um email" });
};

// Confere validade do token, grava novo hash e invalida sessões anteriores.
export const resetPassword: RequestHandler = async (req, res) => {
  const parsed = tokenSchema.safeParse(req.body?.token);
  if (!parsed.success) throw new HttpError(400, "Token inválido ou expirado");
  const token = parsed.data;
  const senha = password(req.body?.senha ?? req.body?.senhaNova);
  if (!token || !senha) throw new HttpError(422, "Token e nova senha são obrigatórios");
  if (senha.length < 8) throw new HttpError(422, "A senha deve ter pelo menos 8 caracteres");
  const tokenHash = createHash("sha256").update(token).digest("hex");
  const request = await prisma.resetar_Senha.findUnique({ where: { token: tokenHash } });
  if (!request || request.expire_in < new Date()) throw new HttpError(400, "Token inválido ou expirado");
  const senha_hash = await bcrypt.hash(senha, 12);
  await prisma.$transaction(async tx => {
    const consumed = await tx.resetar_Senha.deleteMany({ where: { token: tokenHash, expire_in: { gt: new Date() } } });
    if (consumed.count !== 1) throw new HttpError(400, "Token inválido ou expirado");
    await tx.usuarios.update({ where: { id: request.userId }, data: { senha_hash, token_version: { increment: 1 }, atualizado_em: new Date() } });
  }).catch((error: unknown) => {
    if (typeof error === "object" && error !== null && "code" in error && error.code === "P2034") throw new HttpError(400, "Token inválido ou expirado");
    throw error;
  });
  res.json({ success: true });
};
