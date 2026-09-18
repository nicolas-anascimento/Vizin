import { removeAccount } from "../services/accountRemoval.ts";
import bcrypt from "bcrypt";
import crypto from "node:crypto";
import type { RequestHandler } from "express";
import prisma from "../config/database.ts";
import env from "../config/env.ts";
import mailer from "../config/mailer.ts";
import { HttpError } from "../utils/httpError.ts";
import { password, email, text, boolean } from "../utils/validation.ts";
import { cookieOptions } from "./authController.ts";
import { removeUploadByUrl } from "../utils/files.ts";

async function verifyPassword(id: string, value: unknown) {
 const user = await prisma.usuarios.findUniqueOrThrow({ where: { id } });
 if (typeof value !== "string" || !(await bcrypt.compare(value, user.senha_hash))) throw new HttpError(401, "Senha atual incorreta");
 return user;
}
export const changePassword: RequestHandler = async (req, res) => {
 const user = await verifyPassword(req.user!.id, req.body?.senhaAtual ?? req.body?.senha_atual);
 const senha = password(req.body?.senhaNova ?? req.body?.nova_senha);
 if (await bcrypt.compare(senha, user.senha_hash)) throw new HttpError(422, "A nova senha deve ser diferente");
 await prisma.$transaction([prisma.usuarios.update({ where: { id: user.id }, data: { senha_hash: await bcrypt.hash(senha, 12), token_version: { increment: 1 } } }), prisma.resetar_Senha.deleteMany({ where: { userId: user.id } })]);
 res.clearCookie("token", cookieOptions()); res.json({ success: true, loginNecessario: true });
};
export const changePhone: RequestHandler = async (req, res) => {
 const telefone = text(req.body?.telefone ?? req.body?.whatsapp, "Telefone", 20);
 if (!/^[+()\d\s-]{8,20}$/.test(telefone)) throw new HttpError(422, "Telefone inválido");
 await prisma.usuarios.update({ where: { id: req.user!.id }, data: { telefone } }); res.json({ success: true, telefone, whatsapp: telefone });
};
export const changeEmail: RequestHandler = async (req, res) => {
 await verifyPassword(req.user!.id, req.body?.senha);
 const novo = email(req.body?.email);
 if (await prisma.usuarios.findUnique({ where: { email: novo } })) throw new HttpError(409, "E-mail já cadastrado");
 if (!mailer && env.NODE_ENV !== "dev") throw new HttpError(503, "SMTP não configurado");
 const token = crypto.randomBytes(32).toString("hex");
 await prisma.emails_pendentes.upsert({ where: { usuario_id: req.user!.id }, create: { usuario_id: req.user!.id, email: novo, token: crypto.createHash("sha256").update(token).digest("hex"), expira_em: new Date(Date.now()+3600000) }, update: { email: novo, token: crypto.createHash("sha256").update(token).digest("hex"), expira_em: new Date(Date.now()+3600000) } });
 const url = `${env.APP_URL}/api/usuarios/email/confirmar?token=${token}`;
 if (mailer) await mailer.sendMail({ from: env.SMTP_FROM, to: novo, subject: "Confirme seu e-mail VIZIN", text: url });
 else console.log(`Confirmação de e-mail (desenvolvimento): ${url}`);
 res.status(202).json({ success: true, pendente: true });
};
export const confirmEmail: RequestHandler = async (req, res) => {
 const token = text(req.body?.token ?? req.query.token, "Token", 128);
 const pending = await prisma.emails_pendentes.findUnique({ where: { token: crypto.createHash("sha256").update(token).digest("hex") } });
 if (!pending || pending.expira_em < new Date()) throw new HttpError(400, "Token inválido ou expirado");
 await prisma.$transaction([prisma.usuarios.update({ where: { id: pending.usuario_id }, data: { email: pending.email, token_version: { increment: 1 } } }), prisma.emails_pendentes.delete({ where: { id: pending.id } })]);
 res.clearCookie("token", cookieOptions()); res.json({ success: true });
};
export const deleteAvatar: RequestHandler = async (req, res) => {
 const user = await prisma.usuarios.findUniqueOrThrow({ where: { id: req.user!.id } });
 await prisma.usuarios.update({ where: { id: user.id }, data: { foto_url: null } });
 await removeUploadByUrl(user.foto_url); res.json({ success: true, avatarUrl: null });
};
export const closeAccount: RequestHandler = async (req, res) => {
 const user = await verifyPassword(req.user!.id, req.body?.senha);
 await removeAccount(user.id);
 res.clearCookie("token", cookieOptions()); res.json({ success: true });
};
export function preferences(field: "preferencias" | "privacidade"): RequestHandler {
 const keys = field === "privacidade" ? ["perfilPublico"] : ["solicitacao_recebida", "solicitacao_respondida", "lembretes_aluguel", "avaliacao_recebida", "mensagens", "novidades", "canal_whatsapp"];
 return async (req, res) => {
  const user = await prisma.usuarios.findUniqueOrThrow({ where: { id: req.user!.id } });
  if (req.method === "GET") { res.json(user[field]); return; }
  const data: Record<string, boolean> = { ...(user[field] as Record<string, boolean>) };
  for (const [key, value] of Object.entries(req.body ?? {})) { if (!keys.includes(key)) throw new HttpError(422, "Preferência inválida"); data[key] = boolean(value, key); }
  await prisma.usuarios.update({ where: { id: user.id }, data: { [field]: data } }); res.json(data);
 };
}
export const exportAccount: RequestHandler = async (req, res) => {
 const id = req.user!.id;
 const user = await prisma.usuarios.findUniqueOrThrow({ where: { id }, include: { enderecos: true, itens: { include: { fotos_item: true } }, notificacoes: true, verificacoes_identidade: { select: { id: true, status: true, motivo: true, criado_em: true } }, suportes: true, denuncias: true, extrato_carteira: true } });
 const { senha_hash: _hash, token_version: _version, ...perfil } = user;
 const [alugueis, mensagens, avaliacoes] = await Promise.all([prisma.alugueis.findMany({ where: { OR: [{ locador_id: id }, { locatario_id: id }] }, include: { pagamentos: true, eventos: true, retiradas: { include: { fotos: true } }, devolucoes: true } }), prisma.mensagens.findMany({ where: { OR: [{ remetente_id: id }, { destinatario_id: id }] } }), prisma.avaliacoes.findMany({ where: { OR: [{ avaliador_id: id }, { avaliado_id: id }] } })]);
 res.attachment("meus-dados-vizin.json").json({ perfil, alugueis, mensagens, avaliacoes, geradoEm: new Date() });
};

export const deactivateAccount: RequestHandler = async(req,res)=> {
 await verifyPassword(req.user!.id,req.body?.senha);await removeAccount(req.user!.id,true);
 res.clearCookie("token",cookieOptions());res.json({success:true});
};
