import type { RequestHandler } from "express";
import bcrypt from "bcrypt";
import { createHash, randomBytes } from "node:crypto";
import prisma from "../config/database.ts";
import transporter from "../config/mailer.ts";
import env from "../config/env.ts";
import { HttpError } from "../utils/httpError.ts";
import { nonEmptyString } from "../utils/strings.ts";

export const requestResetPassword: RequestHandler = async (req, res) => {
  const email = nonEmptyString(req.body?.email)?.toLowerCase();
  if (!email) throw new HttpError(422, "Email é obrigatório");
  const user = await prisma.usuarios.findUnique({ where: { email } });
  if (user) {
    const token = randomBytes(32).toString("hex");
    const tokenHash = createHash("sha256").update(token).digest("hex");
    await prisma.$transaction([
      prisma.resetar_Senha.deleteMany({ where: { userId: user.id } }),
      prisma.resetar_Senha.create({
        data: { userId: user.id, token: tokenHash, expire_in: new Date(Date.now() + 60 * 60 * 1000) },
      }),
    ]);
    const url = `${env.APP_URL.replace(/\/$/, "")}/resetar-senha?token=${token}`;
    if (transporter) {
      await transporter.sendMail({
        from: env.SMTP_FROM,
        to: email,
        subject: "Recuperação de senha - Vizin",
        html: `<h2>Recuperação de senha</h2><p>Clique no link abaixo para redefinir sua senha:</p><p><a href="${url}">Redefinir senha</a></p><p>Este link expira em 1 hora.</p>`,
      });
    } else if (env.NODE_ENV === "dev") {
      console.log(`Link de recuperação para ${email}: ${url}`);
    }
  }
  res.json({ success: true, message: "Se o usuário existir, enviaremos um email" });
};

export const resetPassword: RequestHandler = async (req, res) => {
  const token = nonEmptyString(req.body?.token);
  const senha = nonEmptyString(req.body?.senha);
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
