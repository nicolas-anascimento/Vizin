import { serializeMessage } from "../utils/serializers.ts";
import { text } from "../utils/validation.ts";
import type { RequestHandler } from "express";
import prisma from "../config/database.ts";
import { HttpError } from "../utils/httpError.ts";
import { nonEmptyString } from "../utils/strings.ts";
import { pageHeaders, pagination } from "../utils/listPage.ts";
import { createNotification } from "../services/notificationPreferences.ts";

// Lista mensagens do usuário respeitando o relacionamento entre remetente e destinatário.
export const listMessages: RequestHandler = async (req, res) => {
  const rentalId = nonEmptyString(req.query.aluguel_id);
  if (!rentalId) throw new HttpError(422, "aluguel_id é obrigatório");
  const rental = await prisma.alugueis.findUnique({ where: { id: rentalId } });
  if (!rental) throw new HttpError(404, "Aluguel não encontrado");
  if (![rental.locador_id, rental.locatario_id].includes(req.user!.id)) throw new HttpError(403, "Acesso negado");
  const {page,limit,skip}=pagination(req);
  const where={aluguel_id:rental.id};
  const [messages,total]=await Promise.all([prisma.mensagens.findMany({ where, include: { usuarios_mensagens_remetente_idTousuarios: { select: { id: true, nome: true, foto_url: true } } }, orderBy: { enviada_em: "asc" }, skip,take:limit }),prisma.mensagens.count({where})]);
  // Ao abrir a página, marca como lidas somente as mensagens recebidas nela.
  await prisma.mensagens.updateMany({ where: { id:{in:messages.map(m=>m.id)}, destinatario_id: req.user!.id, lida: false }, data: { lida: true } });
  pageHeaders(res,total,page,limit);
  res.json(messages.map(m => ({ ...serializeMessage(m, req.user!.id), conteudo: m.conteudo, aluguel_id: m.aluguel_id })));
};

// Valida destinatário e corpo e registra nova mensagem.
export const sendMessage: RequestHandler = async (req, res) => {
  const rentalId = nonEmptyString(req.body?.aluguel_id);
  const content = nonEmptyString(req.body?.conteudo);
  if (!rentalId || !content) throw new HttpError(422, "Aluguel e mensagem são obrigatórios");
  text(content, "Mensagem", 3000);
  if (content.length > 3000) throw new HttpError(422, "A mensagem é muito longa");
  const rental = await prisma.alugueis.findUnique({ where: { id: rentalId } });
  if (!rental) throw new HttpError(404, "Aluguel não encontrado");
  if (![rental.locador_id, rental.locatario_id].includes(req.user!.id)) throw new HttpError(403, "Acesso negado");
  const message = await prisma.$transaction(async (tx) => {
    const target = req.user!.id === rental.locador_id ? rental.locatario_id : rental.locador_id;
    // Bloqueia usuários em ordem estável para conferir bloqueios e criar conversa
    // sem corridas entre envios simultâneos.
    for (const uid of [req.user!.id,target].sort()) await tx.$queryRaw`SELECT id FROM usuarios WHERE id=${uid}::uuid FOR UPDATE`;
    if (await tx.bloqueios.count({ where: { OR: [{ usuario_id:req.user!.id,bloqueado_id:target },{ usuario_id:target,bloqueado_id:req.user!.id }] } })) throw new HttpError(403,"Conversa bloqueada");
    const chave = [rental.locador_id,rental.locatario_id].sort().join(":")+":"+rental.item_id;
    const c = await tx.conversas.upsert({ where:{chave},update:{atualizado_em:new Date()},create:{chave,objeto_id:rental.item_id,participantes:{create:[{usuario_id:rental.locador_id},{usuario_id:rental.locatario_id}]}} });
    const created = await tx.mensagens.create({ data: { conversa_id: c.id, aluguel_id: rental.id, remetente_id: req.user!.id, destinatario_id: target, conteudo: content } });
    await createNotification(tx, { usuario_id: target, contexto:{aluguelId:rental.id,objetoId:rental.item_id,conversaId:c.id}, tipo: "mensagem", titulo: "Nova mensagem", mensagem: content.slice(0, 140) });
    return created;
  });
  res.status(201).json({ success: true, mensagem: serializeMessage(message,req.user!.id) });
};
