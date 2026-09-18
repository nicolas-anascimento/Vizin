import path from "node:path";
import type { RequestHandler } from "express";
import prisma from "../config/database.ts";
import { privateRoot } from "../middlewares/privateUpload.ts";
import { HttpError } from "../utils/httpError.ts";
import { text, uuid } from "../utils/validation.ts";
function serialize(v: any) { return v ? { id: v.id, status: v.status, motivo: v.motivo, criado_em: v.criado_em, analisado_em: v.analisado_em } : { status: "nao_enviado" }; }
export const identityStatus: RequestHandler = async (req, res) => { res.json(serialize(await prisma.verificacoes_identidade.findFirst({ where: { usuario_id: req.user!.id }, orderBy: { criado_em: "desc" } }))); };
export const submitIdentity: RequestHandler = async (req, res) => {
 const files = req.files as Record<string, Express.Multer.File[]>;
 const documentos: Record<string, string> = {};
 for (const key of ["documentoFrente", "documentoVerso", "selfie"]) { const file = files?.[key]?.[0]; if (!file) throw new HttpError(422, "Envie frente, verso e selfie"); documentos[key] = path.basename(file.path); }
 const result = await prisma.$transaction(async tx => {
  await tx.$queryRaw`SELECT id FROM usuarios WHERE id = ${req.user!.id}::uuid FOR UPDATE`;
  const user = await tx.usuarios.findUniqueOrThrow({ where: { id: req.user!.id } });
  if (user.verificado || await tx.verificacoes_identidade.count({ where: { usuario_id: user.id, status: "pendente" } })) throw new HttpError(409, "Verificação já aprovada ou em análise");
  return tx.verificacoes_identidade.create({ data: { usuario_id: user.id, documentos, status: "pendente" } });
 }); res.status(201).json(serialize(result));
};
export const listIdentities: RequestHandler = async (_req, res) => { res.json((await prisma.verificacoes_identidade.findMany({ orderBy: { criado_em: "desc" }, take: 100, include: { usuarios: { select: { id: true, nome: true } } } })).map(v => ({ ...serialize(v), usuario: v.usuarios, documentos: Object.keys(v.documentos as object) }))); };
export const reviewIdentity: RequestHandler = async (req, res) => {
 const status = text(req.body?.status, "Status", 20);
 if (!["aprovado", "rejeitado"].includes(status)) throw new HttpError(422, "Status inválido");
 const result = await prisma.$transaction(async tx => {
  const v = await tx.verificacoes_identidade.findUniqueOrThrow({ where: { id: uuid(req.params.id) } });
  if (v.status !== "pendente") throw new HttpError(409, "Verificação já analisada");
  const changed = await tx.verificacoes_identidade.updateMany({ where: { id: v.id, status: "pendente" }, data: { status, motivo: status === "rejeitado" ? text(req.body?.motivo, "Motivo", 1000) : null, revisor_id: req.user!.id, analisado_em: new Date() } });
  if (!changed.count) throw new HttpError(409, "Verificação já analisada");
  await tx.usuarios.update({ where: { id: v.usuario_id }, data: { verificado: status === "aprovado" } });
  await tx.notificacoes.create({ data: { usuario_id: v.usuario_id, tipo: "verificacao", titulo: "Verificação analisada", mensagem: `Sua verificação foi ${status}.`, contexto: { usuarioId: v.usuario_id } } });
  return tx.verificacoes_identidade.findUniqueOrThrow({ where: { id: v.id } });
 }); res.json(serialize(result));
};
export const identityDocument: RequestHandler = async (req, res) => {
 const v = await prisma.verificacoes_identidade.findUniqueOrThrow({ where: { id: uuid(req.params.id) } });
 const file = (v.documentos as Record<string, string>)[String(req.params.tipo)];
 if (!file || path.basename(file) !== file) throw new HttpError(404, "Documento não encontrado");
 res.setHeader("Cache-Control", "no-store"); res.sendFile(path.join(privateRoot, file));
};
