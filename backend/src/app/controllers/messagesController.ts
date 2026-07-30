import type { RequestHandler } from "express";
import prisma from "../config/database.ts";
import { HttpError } from "../utils/httpError.ts";
import { nonEmptyString } from "../utils/strings.ts";

export const listMessages: RequestHandler = async (req, res) => {
  const rentalId = nonEmptyString(req.query.aluguel_id);
  if (!rentalId) throw new HttpError(422, "aluguel_id é obrigatório");
  const rental = await prisma.alugueis.findUnique({ where: { id: rentalId } });
  if (!rental) throw new HttpError(404, "Aluguel não encontrado");
  if (req.user!.tipo !== "admin" && ![rental.locador_id, rental.locatario_id].includes(req.user!.id)) throw new HttpError(403, "Acesso negado");
  const messages = await prisma.mensagens.findMany({ where: { aluguel_id: rental.id }, include: { usuarios_mensagens_remetente_idTousuarios: { select: { id: true, nome: true, foto_url: true } } }, orderBy: { enviada_em: "asc" } });
  await prisma.mensagens.updateMany({ where: { aluguel_id: rental.id, destinatario_id: req.user!.id, lida: false }, data: { lida: true } });
  res.json(messages);
};

export const sendMessage: RequestHandler = async (req, res) => {
  const rentalId = nonEmptyString(req.body?.aluguel_id);
  const content = nonEmptyString(req.body?.conteudo);
  if (!rentalId || !content) throw new HttpError(422, "Aluguel e mensagem são obrigatórios");
  if (content.length > 3000) throw new HttpError(422, "A mensagem é muito longa");
  const rental = await prisma.alugueis.findUnique({ where: { id: rentalId } });
  if (!rental) throw new HttpError(404, "Aluguel não encontrado");
  if (![rental.locador_id, rental.locatario_id].includes(req.user!.id)) throw new HttpError(403, "Acesso negado");
  const target = req.user!.id === rental.locador_id ? rental.locatario_id : rental.locador_id;
  const message = await prisma.$transaction(async (tx) => {
    const created = await tx.mensagens.create({ data: { aluguel_id: rental.id, remetente_id: req.user!.id, destinatario_id: target, conteudo: content } });
    await tx.notificacoes.create({ data: { usuario_id: target, tipo: "mensagem", titulo: "Nova mensagem", mensagem: content.slice(0, 140) } });
    return created;
  });
  res.status(201).json({ success: true, mensagem: message });
};
