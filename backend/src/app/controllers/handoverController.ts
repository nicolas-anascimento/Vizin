import type { RequestHandler } from "express";
import prisma from "../config/database.ts";
import { HttpError } from "../utils/httpError.ts";
import { uuid, text } from "../utils/validation.ts";
import { withdrawalPhotoUrl } from "../utils/files.ts";
import { businessDate, businessLateDays } from "../utils/dates.ts";
import { finePrice } from "../services/paymentRules.ts";
import { simulated } from "../services/paymentGateway.ts";
const DEMO_WITHDRAWAL_STATUS="demo_retirada_liberada";
// Somente locador e locatário podem consultar ou registrar as fotos destas etapas.
function checkParty(r: { locador_id: string; locatario_id: string }, id: string) { if (![r.locador_id,r.locatario_id].includes(id)) throw new HttpError(403, "Somente participantes podem registrar/consultar esta etapa"); }
// Monta o estado de cada participante e só considera a etapa concluída após dois registros.
async function status(id: string, userId: string, returning: boolean) {
 const r = await prisma.alugueis.findUniqueOrThrow({ where: { id }, include: { retiradas: { include: { fotos: true } }, devolucoes: true } });
 checkParty(r, userId);
 let retiradaDemo:Record<string,unknown>={};
 if(!returning) {
  const [paidPayment,pendingFinancial,openReconciliation,demoEvent]=await Promise.all([
   prisma.pagamentos.count({where:{aluguel_id:id,tipo:"aluguel",status:"pago"}}),
   prisma.pagamentos.count({where:{aluguel_id:id,status:{in:["cancelamento_pendente","estorno_pendente"]}}}),
   prisma.conciliacoes_pagamento.count({where:{pagamento:{aluguel_id:id},status:"aberta"}}),
   simulated()?prisma.eventos_aluguel.findFirst({where:{aluguel_id:id,status:DEMO_WITHDRAWAL_STATUS},select:{id:true}}):Promise.resolve(null)
  ]);
  const dataFutura=r.data_inicio>businessDate();
  const liberada=r.status==="pago"&&Boolean(demoEvent)&&simulated();
  const somenteData=r.status==="pago"&&paidPayment>0&&pendingFinancial===0&&openReconciliation===0&&dataFutura&&!liberada;
  const codigoBloqueio=r.status!=="pago"?"etapa_indisponivel":paidPayment===0?"pagamento_obrigatorio":pendingFinancial||openReconciliation?"operacao_financeira_pendente":dataFutura&&!liberada?"retirada_data_futura":null;
  retiradaDemo={data_retirada:r.data_inicio.toISOString().slice(0,10),codigo_bloqueio:codigoBloqueio,modo_demo:simulated(),retirada_demo_liberada:liberada,pode_liberar_retirada_demo:simulated()&&somenteData};
 }
 const rows = returning ? r.devolucoes.map(d => ({ ...d, urls: d.fotos as string[] })) : r.retiradas.map(d => ({ ...d, urls: d.fotos.map(f => f.url), danos: null }));
 const part = (uid: string) => {
  const row = rows.find(d => d.usuario_id === uid);
  return { enviado: !!row, confirmado: !!row?.confirmado, quantidade: row?.urls.length ?? 0, fotos: row?.urls ?? [], observacoes: row?.observacoes ?? null, danos: row?.danos ?? null, enviado_em: row?.criado_em ?? null, enviadoEm: row?.criado_em ?? null, usuarioId: uid };
 };
 const completed = rows.length === 2;
 const concluded = completed ? rows.reduce((d, row) => row.criado_em > d ? row.criado_em : d, rows[0]!.criado_em) : null;
 return { solicitacao_id: r.id, aluguelId: r.id, status: r.status, ...retiradaDemo, locatario: part(r.locatario_id), proprietario: part(r.locador_id), concluido_em: concluded, concluidoEm: concluded };
}
// Expõe o andamento da retirada ou devolução pelo identificador da solicitação.
export function handoverStatus(returning: boolean): RequestHandler { return async (req, res) => { res.json(await status(uuid(req.params.aluguelId ?? req.params.id), req.user!.id, returning)); }; }
// Libera antecipação somente no modo demo do servidor; grava um evento de auditoria sem mudar datas, status ou notificações.
export const releaseDemoWithdrawal:RequestHandler=async(req,res)=>{
 if(!simulated())throw new HttpError(403,"Liberação de retirada demo indisponível neste ambiente","demo_indisponivel");
 const id=uuid(req.params.id,"Aluguel");
 const result=await prisma.$transaction(async tx=>{
  await tx.$queryRaw`SELECT id FROM alugueis WHERE id=${id}::uuid FOR UPDATE`;
  const rental=await tx.alugueis.findUnique({where:{id}});
  if(!rental)throw new HttpError(404,"Solicitação não encontrada","nao_encontrada");
  checkParty(rental,req.user!.id);
  if(rental.status!=="pago")throw new HttpError(409,rental.status==="cancelado"?"A locação foi cancelada":"A locação não está aguardando retirada",rental.status==="cancelado"?"cancelada":"etapa_indisponivel");
  if(!await tx.pagamentos.count({where:{aluguel_id:id,tipo:"aluguel",status:"pago"}}))throw new HttpError(409,"O pagamento precisa estar confirmado antes da retirada","pagamento_obrigatorio");
  if(await tx.pagamentos.count({where:{aluguel_id:id,status:{in:["cancelamento_pendente","estorno_pendente"]}}})||await tx.conciliacoes_pagamento.count({where:{pagamento:{aluguel_id:id},status:"aberta"}}))throw new HttpError(409,"Operação financeira pendente impede a retirada","operacao_financeira_pendente");
  const existing=await tx.eventos_aluguel.findFirst({where:{aluguel_id:id,status:DEMO_WITHDRAWAL_STATUS},select:{id:true}});
  if(existing)return true;
  if(rental.data_inicio<=businessDate())throw new HttpError(409,"A retirada já está disponível pela data combinada","retirada_data_disponivel");
  await tx.eventos_aluguel.create({data:{aluguel_id:id,usuario_id:req.user!.id,status:DEMO_WITHDRAWAL_STATUS,motivo:"Liberação antecipada da retirada em modo demo; data contratual preservada"}});
  return true;
 });
 res.json({success:result,retirada_demo_liberada:true,...await status(id,req.user!.id,false)});
};
/*
 * Recebe de uma a cinco fotos e observações da retirada ou da devolução.
 * A transação bloqueia o aluguel para que confirmações simultâneas não avancem
 * o estado duas vezes nem criem duas multas.
 */
export function recordHandover(returning: boolean): RequestHandler { return async (req, res) => {
 let rentalId = req.params.aluguelId ?? req.params.id ?? req.body?.aluguel_id ?? req.body?.pedido_id;
 // Compatibilidade: algumas rotas antigas identificam o aluguel pelo objeto em vez do ID.
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
  // A retirada exige pagamento estável e data combinada já alcançada.
  if (!returning && (await tx.pagamentos.count({where:{aluguel_id:id,status:{in:["cancelamento_pendente","estorno_pendente"]}}}) || await tx.conciliacoes_pagamento.count({where:{pagamento:{aluguel_id:id},status:"aberta"}}))) throw new HttpError(409,"Operação financeira pendente ou conciliação impede retirada");
  if (!returning) {
   if(!await tx.pagamentos.count({where:{aluguel_id:id,tipo:"aluguel",status:"pago"}}))throw new HttpError(409,"O pagamento precisa estar confirmado antes da retirada","pagamento_obrigatorio");
   if(rental.data_inicio>businessDate()) {
    const demoRelease=simulated()?await tx.eventos_aluguel.findFirst({where:{aluguel_id:id,status:DEMO_WITHDRAWAL_STATUS},select:{id:true}}):null;
    if(!demoRelease)throw new HttpError(409,"Retirada anterior à data combinada","retirada_data_futura");
   }
  }
  let count: number;
  if (returning) {
   await tx.devolucoes.create({ data: { aluguel_id: id, usuario_id: req.user!.id, fotos: files.map(f => withdrawalPhotoUrl(f.path)), observacoes, danos, confirmado: true } });
   count = await tx.devolucoes.count({ where: { aluguel_id: id } });
  } else {
   await tx.retiradas.create({ data: { aluguel_id: id, usuario_id: req.user!.id, observacoes, confirmado: true, fotos: { create: files.map(f => ({ url: withdrawalPhotoUrl(f.path) })) } } });
   count = await tx.retiradas.count({ where: { aluguel_id: id } });
  }
  // O estado só avança quando as duas partes registraram fotos. Na devolução atrasada,
  // a multa é gravada nesse instante para que os dias de atraso deixem de crescer.
  if (count === 2) {
   const next = returning ? "devolvido" : "retirado";
   await tx.alugueis.update({ where: { id }, data: { status: next, atualizado_em: new Date() } });
   await tx.eventos_aluguel.create({ data: { aluguel_id: id, usuario_id: req.user!.id, status: next, motivo: "Fotos confirmadas pelas duas partes" } });
   if (returning && businessLateDays(rental.data_fim) > 0) {
    const snapshot = finePrice({ status: "retirado", data_fim: rental.data_fim });
    await tx.multas_aluguel.create({ data: { aluguel_id: id, dias_atraso: snapshot.dias_atraso, valor_dia: snapshot.valor_dia, valor_total: snapshot.valor_total, valor_plataforma: snapshot.valor_plataforma, valor_proprietario: snapshot.valor_proprietario, status: "pendente" } });
    await tx.notificacoes.create({ data: { usuario_id: rental.locatario_id, tipo: "bloqueio_conta", titulo: "Multa por atraso", mensagem: "A devolução em atraso gerou multa pendente.", contexto: { solicitacao_id: id, aluguelId: id } } });
   }
  }
  // Informa conclusão às duas partes ou avisa a parte que ainda precisa enviar fotos.
  if (count === 2) await tx.notificacoes.createMany({ data: [rental.locador_id, rental.locatario_id].map(usuario_id => ({ usuario_id, tipo: returning ? "devolucao_confirmada" : "retirada_confirmada", titulo: returning ? "Devolução confirmada" : "Retirada confirmada", mensagem: "Ambas as partes confirmaram a etapa.", contexto: { solicitacao_id: id, aluguelId: id, objetoId: rental.item_id } })) });
  else await tx.notificacoes.create({ data: { usuario_id: rental.locador_id === req.user!.id ? rental.locatario_id : rental.locador_id, tipo: returning ? "devolucao" : "retirada", titulo: "Fotos registradas", mensagem: "A outra parte enviou suas fotos. Envie as suas para confirmar.", contexto: { solicitacao_id: id, aluguelId: id, objetoId: rental.item_id } } });
 });
 res.status(201).json({ success: true, ...await status(id, req.user!.id, returning) });
 }; }
