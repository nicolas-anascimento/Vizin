import type { RequestHandler } from "express";
import prisma from "../config/database.ts";
import { HttpError } from "../utils/httpError.ts";
import { uuid, text } from "../utils/validation.ts";
import { publicUploadUrl } from "../utils/files.ts";
function checkParty(r: { locador_id: string; locatario_id: string }, id: string) { if (![r.locador_id,r.locatario_id].includes(id)) throw new HttpError(403, "Somente participantes podem registrar/consultar esta etapa"); }
async function status(id: string, userId: string, returning: boolean) {
 const r = await prisma.alugueis.findUniqueOrThrow({ where: { id }, include: { retiradas: { include: { fotos: true } }, devolucoes: true } });
 checkParty(r, userId);
 const rows = returning ? r.devolucoes.map(d => ({ ...d, urls: d.fotos as string[] })) : r.retiradas.map(d => ({ ...d, urls: d.fotos.map(f => f.url), danos: null }));
 const part = (uid: string) => {
  const row = rows.find(d => d.usuario_id === uid);
  return { enviado: !!row, confirmado: !!row?.confirmado, quantidade: row?.urls.length ?? 0, fotos: row?.urls ?? [], observacoes: row?.observacoes ?? "", danos: row?.danos ?? null, enviadoEm: row?.criado_em ?? null, usuarioId: uid };
 };
 const completed = rows.length === 2;
 return { aluguelId: r.id, status: r.status, locatario: part(r.locatario_id), proprietario: part(r.locador_id), concluidoEm: completed ? rows.reduce((d, row) => row.criado_em > d ? row.criado_em : d, rows[0]!.criado_em) : null };
}
export function handoverStatus(returning: boolean): RequestHandler { return async (req, res) => { res.json(await status(uuid(req.params.aluguelId), req.user!.id, returning)); }; }
export function recordHandover(returning: boolean): RequestHandler { return async (req, res) => {
 let rentalId = req.params.aluguelId ?? req.body?.aluguel_id ?? req.body?.pedido_id;
 if (!rentalId && req.body?.objeto_id) {
  const found = await prisma.alugueis.findFirst({ where: { item_id: uuid(req.body.objeto_id), OR: [{ locador_id: req.user!.id }, { locatario_id: req.user!.id }], status: returning ? "retirado" : "pago" } });
  rentalId = found?.id;
 }
 const id = uuid(rentalId, "Aluguel");
 const files = Array.isArray(req.files) ? req.files : Object.values(req.files ?? {}).flat();
 if (!files.length || files.length > 5) throw new HttpError(422, "Envie de uma a cinco fotos");
 const observacoes = req.body?.observacoes ? text(req.body.observacoes, "Observações", 3000) : null;
 const danos = returning && req.body?.danos ? text(req.body.danos, "Danos", 3000) : null;
 await prisma.$transaction(async tx => {
  await tx.$queryRaw`SELECT id FROM alugueis WHERE id = ${id}::uuid FOR UPDATE`;
  const rental = await tx.alugueis.findUniqueOrThrow({ where: { id } });
  checkParty(rental, req.user!.id);
  if (rental.status !== (returning ? "retirado" : "pago")) throw new HttpError(409, "Aluguel não está apto para esta etapa");
  if (!returning && (await tx.pagamentos.count({where:{aluguel_id:id,status:{in:["cancelamento_pendente","estorno_pendente"]}}}) || await tx.conciliacoes_pagamento.count({where:{pagamento:{aluguel_id:id},status:"aberta"}}))) throw new HttpError(409,"Operação financeira pendente ou conciliação impede retirada");
  if (!returning && rental.data_inicio > new Date(new Date().toISOString().slice(0,10))) throw new HttpError(409, "Retirada anterior à data combinada");
  let count: number;
  if (returning) {
   await tx.devolucoes.create({ data: { aluguel_id: id, usuario_id: req.user!.id, fotos: files.map(f => publicUploadUrl(f.path)), observacoes, danos, confirmado: true } });
   count = await tx.devolucoes.count({ where: { aluguel_id: id } });
  } else {
   await tx.retiradas.create({ data: { aluguel_id: id, usuario_id: req.user!.id, observacoes, confirmado: true, fotos: { create: files.map(f => ({ url: publicUploadUrl(f.path) })) } } });
   count = await tx.retiradas.count({ where: { aluguel_id: id } });
  }
  if (count === 2) {
   const next = returning ? "devolvido" : "retirado";
   await tx.alugueis.update({ where: { id }, data: { status: next, atualizado_em: new Date() } });
   await tx.eventos_aluguel.create({ data: { aluguel_id: id, usuario_id: req.user!.id, status: next, motivo: "Fotos confirmadas pelas duas partes" } });
  }
  await tx.notificacoes.create({ data: { usuario_id: rental.locador_id === req.user!.id ? rental.locatario_id : rental.locador_id, tipo: returning ? "devolucao" : "retirada", titulo: "Fotos registradas", mensagem: count === 2 ? "Ambas as partes confirmaram a etapa." : "A outra parte enviou suas fotos. Envie as suas para confirmar.", contexto: { aluguelId: id, objetoId: rental.item_id } } });
 });
 res.status(201).json({ success: true, ...await status(id, req.user!.id, returning) });
 }; }
