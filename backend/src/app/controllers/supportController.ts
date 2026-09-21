import crypto from "node:crypto";
import type { RequestHandler } from "express";
import prisma from "../config/database.ts";
import { HttpError } from "../utils/httpError.ts";
import { text, uuid } from "../utils/validation.ts";
import { pagination } from "../utils/listPage.ts";
const protocol = () =>
  `VIZIN-${new Date().toISOString().slice(0, 10).replaceAll("-", "")}-${crypto.randomUUID()}`;
// Registra pedido de ajuda do usuário e devolve protocolo de acompanhamento.
export const requestHelp: RequestHandler = async (req, res) => {
  const row = await prisma.suportes.create({
    data: {
      usuario_id: req.user!.id,
      assunto: text(req.body?.assunto, "Assunto", 150),
      mensagem: text(req.body?.mensagem, "Mensagem", 10000),
      protocolo: protocol(),
    },
  });
  res
    .status(201)
    .json({
      success: true,
      id: row.id,
      protocolo: row.protocolo,
      status: row.status,
    });
};
// Registra denúncia com contexto informado pelo usuário.
export const report: RequestHandler = async (req, res) => {
  let conversationId: string | null = req.params.id
    ? uuid(req.params.id)
    : null;
  let target =
    req.body?.contra ?? req.body?.usuarioId ?? req.body?.denunciado_id;
  if (conversationId) {
    const c = await prisma.conversas.findFirst({
      where: {
        id: conversationId,
        participantes: { some: { usuario_id: req.user!.id } },
      },
      include: { participantes: true },
    });
    if (!c) throw new HttpError(404, "Conversa não encontrada");
    target = c.participantes.find(
      (p) => p.usuario_id !== req.user!.id,
    )?.usuario_id;
  }
  const rentalId = req.body?.aluguelId ?? req.body?.aluguel_id;
  if (rentalId) {
    const r = await prisma.alugueis.findUnique({
      where: { id: uuid(rentalId) },
    });
    if (!r || ![r.locador_id, r.locatario_id].includes(req.user!.id))
      throw new HttpError(403, "Aluguel inacessível");
  }
  const itemId = req.body?.produtoId ?? req.body?.objeto_id;
  if (
    itemId &&
    !(await prisma.itens.findUnique({ where: { id: uuid(itemId) } }))
  )
    throw new HttpError(404, "Objeto não encontrado");
  if (
    target &&
    (target === req.user!.id ||
      !(await prisma.usuarios.findUnique({ where: { id: uuid(target) } })))
  )
    throw new HttpError(422, "Usuário denunciado inválido");
  const ids =
    req.body?.anexoIds ??
    (req.body?.attachmentId ? [req.body.attachmentId] : []);
  if (!Array.isArray(ids) || ids.length > 5)
    throw new HttpError(422, "Evidências inválidas");
  const attachments = await prisma.anexos.findMany({
    where: { id: { in: ids.map((id) => uuid(id)) }, usuario_id: req.user!.id },
  });
  if (attachments.length !== ids.length)
    throw new HttpError(403, "Evidência inacessível");
  const row = await prisma.denuncias.create({
    data: {
      usuario_id: req.user!.id,
      denunciado_id: target ? uuid(target) : null,
      objeto_id: itemId ? uuid(itemId) : null,
      aluguel_id: rentalId ? uuid(rentalId) : null,
      conversa_id: conversationId,
      motivo: text(req.body?.motivo, "Motivo", 150),
      assunto: req.body?.assunto
        ? text(req.body.assunto, "Assunto", 150)
        : null,
      mensagem: text(req.body?.mensagem, "Mensagem", 10000),
      evidencias: ids,
      protocolo: protocol(),
    },
  });
  res
    .status(201)
    .json({
      success: true,
      id: row.id,
      protocolo: row.protocolo,
      status: row.status,
    });
};
// Abre sinistro relacionado ao aluguel após validar participação e dados.
export const reportClaim: RequestHandler = async (req, res) => {
  const id = uuid(req.body?.aluguel_id ?? req.body?.aluguelId);
  const r = await prisma.alugueis.findUniqueOrThrow({ where: { id } });
  if (![r.locador_id, r.locatario_id].includes(req.user!.id))
    throw new HttpError(403, "Acesso negado");
  if (!["retirado", "devolvido", "finalizado"].includes(r.status ?? ""))
    throw new HttpError(409, "Sinistro exige aluguel com retirada registrada");
  const amount = req.body?.valor_solicitado;
  if (
    amount !== undefined &&
    (!Number.isFinite(Number(amount)) ||
      Number(amount) < 0 ||
      Number(amount) > Number(r.valor_total) * 100)
  )
    throw new HttpError(422, "Valor inválido");
  const claim = await prisma.sinistros.create({
        data: {
          aluguel_id: id,
          reportador_id: req.user!.id,
          descricao: text(
            req.body?.descricao ?? req.body?.mensagem,
            "Descrição",
            10000,
          ),
          ...(amount !== undefined ? { valor_solicitado: Number(amount) } : {}),
        },
      });
  res.status(201).json({ ...claim, valor_solicitado: claim.valor_solicitado == null ? null : Number(claim.valor_solicitado), valor_aprovado: claim.valor_aprovado == null ? null : Number(claim.valor_aprovado) });
};
// Lista chamados de suporte pertencentes ao usuário autenticado.
export const mySupport: RequestHandler = async (req, res) => {
  const {page,limit,skip}=pagination(req);
  const [suporte, denuncias, sinistros, suporteTotal, denunciasTotal, sinistrosTotal] = await Promise.all([
    prisma.suportes.findMany({ where: { usuario_id: req.user!.id },orderBy:{criado_em:"desc"},skip,take:limit,select:{id:true,assunto:true,mensagem:true,status:true,protocolo:true,resposta:true,criado_em:true,atualizado_em:true} }),
    prisma.denuncias.findMany({ where: { usuario_id: req.user!.id },orderBy:{criado_em:"desc"},skip,take:limit,select:{id:true,denunciado_id:true,objeto_id:true,aluguel_id:true,motivo:true,assunto:true,mensagem:true,evidencias:true,status:true,protocolo:true,resposta_usuario:true,criado_em:true,atualizado_em:true} }),
    prisma.sinistros.findMany({ where: { reportador_id: req.user!.id },orderBy:{criado_em:"desc"},skip,take:limit,select:{id:true,aluguel_id:true,status:true,descricao:true,valor_solicitado:true,valor_aprovado:true,resposta_usuario:true,criado_em:true,atualizado_em:true} }),
    prisma.suportes.count({where:{usuario_id:req.user!.id}}),
    prisma.denuncias.count({where:{usuario_id:req.user!.id}}),
    prisma.sinistros.count({where:{reportador_id:req.user!.id}}),
  ]);
  res.json({ suporte, denuncias, sinistros:sinistros.map(row=>({...row,valor_solicitado:row.valor_solicitado==null?null:Number(row.valor_solicitado),valor_aprovado:row.valor_aprovado==null?null:Number(row.valor_aprovado)})), paginacao:{page,limit,totais:{suporte:suporteTotal,denuncias:denunciasTotal,sinistros:sinistrosTotal}} });
};
