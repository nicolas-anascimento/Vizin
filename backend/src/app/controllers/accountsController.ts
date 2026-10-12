import type { RequestHandler } from "express";
import bcrypt from "bcrypt";
import { createHash, randomBytes } from "node:crypto";
import prisma from "../config/database.ts";
import env from "../config/env.ts";
import { HttpError } from "../utils/httpError.ts";
import { password, email as validEmail } from "../utils/validation.ts";
import { nonEmptyString } from "../utils/strings.ts";

// Gera token temporário de redefinição e solicita envio ao email cadastrado.
export const requestResetPassword: RequestHandler = async (req, res) => {
  const email = validEmail(req.body?.email);
  if (!email) throw new HttpError(422, "Email é obrigatório");
  const user = await prisma.usuarios.findUnique({ where: { email } });
  if (user) {
    const token = randomBytes(32).toString("hex");
    const tokenHash = createHash("sha256").update(token).digest("hex");
    const url = `${env.APP_URL.replace(/\/$/, "")}/resetar-senha?token=${token}`;
    await prisma.$transaction(async tx => {
      await tx.resetar_Senha.deleteMany({ where: { userId: user.id } });
      await tx.resetar_Senha.create({ data: { userId: user.id, token: tokenHash, expire_in: new Date(Date.now() + 60 * 60 * 1000) } });
      await tx.email_outbox.create({ data: { tipo: "recuperacao_senha", destinatario: email, chave: `recuperacao:${user.id}:${tokenHash}`, payload: { subject: "Recuperação de senha - Vizin", text: `Use este link para redefinir sua senha (válido por 1 hora): ${url}` } } });
    });
  }
  res.json({ success: true, message: "Se o usuário existir, enviaremos um email" });
};

// Confere validade do token, grava novo hash e invalida sessões anteriores.
export const resetPassword: RequestHandler = async (req, res) => {
  const token = nonEmptyString(req.body?.token);
  const senha = password(req.body?.senha ?? req.body?.senhaNova);
  if (!token || !senha) throw new HttpError(422, "Token e nova senha são obrigatórios");
  if (senha.length < 8) throw new HttpError(422, "A senha deve ter pelo menos 8 caracteres");
  const tokenHash = createHash("sha256").update(token).digest("hex");
  const request = await prisma.resetar_Senha.findUnique({ where: { token: tokenHash } });
  if (!request || request.expire_in < new Date()) throw new HttpError(400, "Token inválido ou expirado");
  await prisma.$transaction([
    prisma.usuarios.update({ where: { id: request.userId }, data: { senha_hash: await bcrypt.hash(senha, 12), token_version: { increment: 1 }, atualizado_em: new Date() } }),
    prisma.resetar_Senha.delete({ where: { token: tokenHash } }),
  ]);
  res.json({ success: true });
};
