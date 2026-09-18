import crypto from "node:crypto";
import type { Request, RequestHandler } from "express";
import prisma from "../config/database.ts";
import { HttpError } from "../utils/httpError.ts";
import { parseDateOnly } from "../utils/dates.ts";
import { serializeRental, serializePayment } from "../utils/serializers.ts";
import { uuid, text } from "../utils/validation.ts";
import { rentalInclude } from "./rentalsController.ts";
import { simulated, gatewayRequest, verifyWebhook } from "../services/paymentGateway.ts";
import { maintainRentals } from "../services/rentalMaintenance.ts";
async function resolveRental(req: Request) {
 await maintainRentals();
 const id = req.body?.solicitacao_id ?? req.body?.aluguel_id ?? req.body?.pedido_id;
 const rental = id ? await prisma.alugueis.findUnique({ where: { id: uuid(id) }, include: rentalInclude }) : await prisma.alugueis.findFirst({ where: { item_id: uuid(req.body?.objeto_id ?? req.body?.item_id), locatario_id: req.user!.id, data_inicio: parseDateOnly(req.body?.data_retirada ?? req.body?.retirada), data_fim: parseDateOnly(req.body?.data_devolucao ?? req.body?.devolucao), status: { in: ["aprovado", "pago"] } }, include: rentalInclude });
 if (!rental) throw new HttpError(404, "Aluguel aprovado não encontrado");
 if (rental.locatario_id !== req.user!.id) throw new HttpError(403, "Somente locatário pode pagar");
 if (!["aprovado", "pago"].includes(rental.status ?? "")) throw new HttpError(409, "Aluguel não pode ser pago");
 return rental;
}
async function createPayment(req: Request, method: "pix" | "cartao"): Promise<Awaited<ReturnType<typeof prisma.pagamentos.findUniqueOrThrow>>> {
 const r = await resolveRental(req);
 const key = `${r.id}:${text(req.headers["idempotency-key"] ?? `${method}:${crypto.randomUUID()}`, "Idempotency-Key", 150)}`;
 let payment = await prisma.$transaction(async tx => {
  await tx.$queryRaw`SELECT id FROM alugueis WHERE id = ${r.id}::uuid FOR UPDATE`;
  const current = await tx.alugueis.findUniqueOrThrow({ where: { id: r.id } });
  if (!["aprovado", "pago"].includes(current.status ?? "")) throw new HttpError(409, "Aluguel não pode ser pago");
  if (await tx.conciliacoes_pagamento.count({where:{pagamento:{aluguel_id:r.id},status:"aberta"}})) throw new HttpError(409,"Pagamento exige conciliação");
  const requested = await tx.pagamentos.findUnique({ where:{idempotencia:key} });
  if (requested) {
   if(requested.metodo !== method) throw new HttpError(409,"Chave idempotente utilizada para outro método");
   return requested;
  }
  const existing = await tx.pagamentos.findFirst({ where: { aluguel_id: r.id, status: { in: ["pago", "pendente", "cancelamento_pendente", "estorno_pendente"] } }, orderBy: { criado_em: "desc" } });
  if (existing) return existing;
  return tx.pagamentos.create({ data: { aluguel_id: r.id, valor: r.valor_total, metodo: method, idempotencia: key, status: "pendente", gateway: simulated() ? "demo" : "real" } });
 });
 if (["cancelamento_pendente","estorno_pendente"].includes(payment.status ?? "")) throw new HttpError(409,"Operação financeira pendente; aguarde confirmação");
 if(payment.metodo !== method) {
  if(payment.status !== "pendente") throw new HttpError(409,"Método diferente já pago; solicite estorno");
  const canceled=await requestFinancial(payment.id,"cancel");
  if(canceled.status !== "cancelado") throw new HttpError(409,"Cancelamento pendente; aguarde antes de trocar método");
  return createPayment(req,method);
 }
 if (!payment.referencia && payment.status === "pendente") {
  const result = payment.gateway === "demo" ? { referencia: payment.id, status: "pendente" as const, codigo_copia_cola: `SIMULADO|VIZIN|${payment.id}|${Number(payment.valor).toFixed(2)}`, qrcode_url: undefined, expira_em: new Date(Date.now()+1800000).toISOString() } : await gatewayRequest("payments", { id: payment.id, aluguelId: r.id, valor: Number(payment.valor), metodo: payment.metodo, tokenCartao: req.body?.token_cartao ?? req.body?.tokenCartao }, payment.idempotencia!);
  payment = await prisma.pagamentos.update({ where: { id: payment.id }, data: { referencia: result.referencia, dados: { ...(result.codigo_copia_cola ? { codigo_copia_cola: result.codigo_copia_cola, qr_code: result.codigo_copia_cola } : {}), ...(result.qrcode_url ? { qrcode_url: result.qrcode_url } : {}), ...(result.expira_em ? { expira_em: result.expira_em } : {}) } } });
  await reconcilePaymentWebhooks(payment.referencia!);
  if (["falhou","cancelado"].includes(result.status)) await applyPayment(payment.id,result.status);
  payment=await prisma.pagamentos.findUniqueOrThrow({where:{id:payment.id}});
 }
 if (["falhou","cancelado","estornado"].includes(payment.status ?? "")) throw new HttpError(402,"Cobrança recusada ou encerrada pelo gateway");
 return payment;
}
export async function applyPayment(id: string, status: string, eventId?: string) {
 return prisma.$transaction(async tx => {
  const p = await tx.pagamentos.findUniqueOrThrow({ where: { id } });
  await tx.$queryRaw`SELECT id FROM alugueis WHERE id = ${p.aluguel_id}::uuid FOR UPDATE`;
  if (eventId) {
   const existed = await tx.webhook_eventos.findUnique({ where: { id: eventId } });
   if (existed?.processado_em || (existed && !existed.payload)) return tx.pagamentos.findUniqueOrThrow({ where: { id } });
   await tx.webhook_eventos.upsert({where:{id:eventId},create:{id:eventId,processado_em:new Date()},update:{processado_em:new Date()}});
  }
  const current = await tx.pagamentos.findUniqueOrThrow({ where: { id } });
  if (current.status === status) return current;
  const r = await tx.alugueis.findUniqueOrThrow({ where: { id: p.aluguel_id } });
  const allowed: Record<string,string[]> = { pendente: ["pago", "falhou", "cancelado"], cancelamento_pendente:["cancelado","pago","falhou"], pago: ["estornado"], estorno_pendente:["estornado"] };
  const incompatible = !(allowed[current.status ?? "pendente"] ?? []).includes(status);
  const late = status === "pago" && (r.status !== "aprovado" || !!(r.pagamento_ate && r.pagamento_ate < new Date()) || current.status === "cancelamento_pendente");
  const unsafeRefund = status === "estornado" && !["pago", "cancelado"].includes(r.status ?? "");
  if(incompatible || late || unsafeRefund) {
   if(!eventId && incompatible) throw new HttpError(409,"Transição de pagamento inválida");
   await tx.conciliacoes_pagamento.upsert({where:{chave:`${id}:${status}:${current.status}`},create:{pagamento_id:id,chave:`${id}:${status}:${current.status}`,motivo:late?"Pagamento recebido fora do prazo ou durante cancelamento":unsafeRefund?"Estorno após retirada": "Evento financeiro fora de ordem",dados:{status,eventId:eventId??null}},update:{}});
  }
  // A late receipt must be recorded even after local cancellation, without advancing the rental.
  const competing = status === "pago" && !!await tx.pagamentos.findFirst({where:{aluguel_id:r.id,id:{not:id},status:{in:["pendente","pago","cancelamento_pendente","estorno_pendente"]}}});
  const receipt = status === "pago" && ["cancelado","falhou"].includes(current.status ?? "");
  if(incompatible && !receipt) return current;
  const updated = await tx.pagamentos.update({ where: { id }, data: { status:competing ? "conciliacao" : status, ...(status === "pago" ? { pago_em: new Date() } : {}) } });
  if (["pago", "estornado"].includes(status) && !late && !unsafeRefund && !incompatible && !competing) {
   const next = status === "pago" ? "pago" : "cancelado";
   await tx.alugueis.update({ where: { id: r.id }, data: { status: next, atualizado_em: new Date() } });
   await tx.eventos_aluguel.create({ data: { aluguel_id: r.id, status: next, motivo: `Pagamento ${status}` } });
  }
  await tx.notificacoes.createMany({ data: [r.locador_id,r.locatario_id].map(usuario_id => ({ usuario_id, tipo: "pagamento", titulo: "Pagamento atualizado", mensagem: `Pagamento ${status}${late || unsafeRefund ? "; exige conciliação" : ""}.`, contexto: { aluguelId: r.id, objetoId: r.item_id, pagamentoId: id } })) });
  return updated;
 });
}
// Persist intent under the same rental lock used by handover BEFORE contacting the provider.
export async function requestFinancial(id:string, operation:"cancel"|"refund") {
 const pending=operation === "cancel" ? "cancelamento_pendente" : "estorno_pendente";
 const terminal=operation === "cancel" ? "cancelado" : "estornado";
 const p=await prisma.$transaction(async tx=>{
  const initial=await tx.pagamentos.findUniqueOrThrow({where:{id}});
  await tx.$queryRaw`SELECT id FROM alugueis WHERE id=${initial.aluguel_id}::uuid FOR UPDATE`;
  const current=await tx.pagamentos.findUniqueOrThrow({where:{id},include:{alugueis:true}});
  if(current.status===terminal) return current;
  if(![operation === "cancel" ? "pendente" : "pago",pending].includes(current.status??"")) throw new HttpError(409,"Operação financeira não permitida");
  if(operation === "refund" && !["pago","cancelado"].includes(current.alugueis.status??"")) throw new HttpError(409,"Estorno não permitido após retirada");
  if(!["demo","real"].includes(current.gateway)) throw new HttpError(409,"Gateway legado exige análise antes de operação financeira");
  if(current.gateway !== "demo" && !current.referencia) throw new HttpError(409,"Criação de cobrança ainda não concluída");
  return tx.pagamentos.update({where:{id},data:{status:pending}});
 });
 if(p.status===terminal) return p;
 if(p.gateway === "demo") return applyPayment(id,terminal);
 const result=await gatewayRequest(`payments/${encodeURIComponent(p.referencia!)}/${operation}`,{},`${operation}:${id}`);
 if(result.referencia!==p.referencia) throw new HttpError(502,"Referência da operação diverge da cobrança; operação continua pendente");
 if(result.status===terminal) return applyPayment(id,terminal);
 return prisma.pagamentos.findUniqueOrThrow({where:{id}});
}
export const generatePix: RequestHandler = async (req,res) => { const p = await createPayment(req,"pix"); res.json({ success: true, ...serializePayment(p), pagamento_id: p.id, pedido_id: p.aluguel_id }); };
export const confirmPix: RequestHandler = async (req,res) => {
 if (!simulated()) throw new HttpError(403,"Confirmação manual só permitida no gateway simulado de desenvolvimento");
 const r = await resolveRental(req);
 const p = await prisma.pagamentos.findFirst({ where: { aluguel_id: r.id, metodo: "pix", status: { in: ["pendente","pago"] } } });
 if (!p) throw new HttpError(409,"Gere o PIX antes de confirmar");
 if(p.gateway !== "demo") throw new HttpError(403,"Pagamento não pertence ao gateway demo");
 const updated = await applyPayment(p.id,"pago"); res.json({ success: true, ...serializePayment(updated), pedido_id: r.id });
};
export const payCard: RequestHandler = async (req,res) => {
 text(req.body?.token_cartao ?? req.body?.tokenCartao,"Token do cartão",1000);
 const p = await createPayment(req,"cartao");
 const result = simulated() && p.gateway === "demo" && p.metodo === "cartao" && p.status === "pendente" ? await applyPayment(p.id,"pago") : p;
 res.json({ success: true, ...serializePayment(result), pedido_id: p.aluguel_id });
};
async function paymentForParty(id: unknown, userId: string, admin: boolean) {
 const p = await prisma.pagamentos.findUnique({ where: { id: uuid(id) }, include: { alugueis: true } });
 if (!p) throw new HttpError(404,"Pagamento não encontrado");
 if (!admin && ![p.alugueis.locador_id,p.alugueis.locatario_id].includes(userId)) throw new HttpError(403,"Acesso negado");
 return p;
}
export const paymentStatus: RequestHandler = async(req,res) => { res.json(serializePayment(await paymentForParty(uuid(req.params.id), req.user!.id, req.user!.tipo === "admin"))); };
export const refundPayment: RequestHandler = async(req,res) => {
 const p = await paymentForParty(uuid(req.params.id),req.user!.id,req.user!.tipo === "admin");
 if (p.alugueis.locatario_id !== req.user!.id && req.user!.tipo !== "admin") throw new HttpError(403,"Somente pagador ou administrador pode solicitar estorno");
 const result=await requestFinancial(p.id,"refund");
 res.status(result.status === "estorno_pendente" ? 202 : 200).json({success:true,...serializePayment(result)});
};
export type PaymentEvent = {id:string;referencia:string;valor:number;status:string};
export function validatePaymentEvent(input:unknown): PaymentEvent {
 if(!input || typeof input !== "object" || Array.isArray(input)) throw new HttpError(400,"Evento deve ser objeto JSON");
 const e=input as Record<string,unknown>;
 const id=text(e.id,"Evento",150), referencia=text(e.referencia,"Referência",200), status=text(e.status,"Status",30);
 if(typeof e.valor !== "number" || !Number.isFinite(e.valor) || e.valor <= 0 || Math.abs(e.valor*100-Math.round(e.valor*100))>0.000001) throw new HttpError(422,"Valor inválido");
 if(!["pendente","pago","falhou","cancelado","estornado"].includes(status)) throw new HttpError(422,"Status inválido");
 return {id,referencia,valor:e.valor,status};
}
async function processWebhook(event:PaymentEvent):Promise<boolean> {
 const p=await prisma.pagamentos.findUnique({where:{referencia:event.referencia}});
 if(!p) return false;
 if(p.gateway !== "real") throw new HttpError(422,"Webhook exige pagamento real");
 if(event.valor !== Number(p.valor)) throw new HttpError(422,"Valor do provedor diverge do pagamento");
 await applyPayment(p.id,event.status,event.id); return true;
}
export async function reconcilePaymentWebhooks(reference?:string) {
 const rows=await prisma.webhook_eventos.findMany({where:{processado_em:null},orderBy:{criado_em:"asc"}});
 for(const row of rows) {
  if(!row.payload) continue;
  const event=validatePaymentEvent(row.payload);
  if(reference && event.referencia!==reference) continue;
  try { await processWebhook(event); } catch(error) { if(!(error instanceof HttpError)) throw error; console.error("Webhook pendente exige análise",row.id,error.message); }
 }
}
export const paymentWebhook: RequestHandler = async(req,res) => {
 if (!Buffer.isBuffer(req.body)) throw new HttpError(400,"Corpo inválido");
 verifyWebhook(req.body,req.headers["x-webhook-signature"]);
 let input:unknown; try { input=JSON.parse(req.body.toString("utf8")); } catch { throw new HttpError(400,"JSON inválido"); }
 const event=validatePaymentEvent(input);
 const known=await prisma.pagamentos.findUnique({where:{referencia:event.referencia}});
 if(known && (known.gateway !== "real" || Number(known.valor)!==event.valor)) throw new HttpError(422,"Gateway ou valor incompatível");
 const stored=await prisma.webhook_eventos.upsert({where:{id:event.id},create:{id:event.id,payload:event},update:{}});
 if(stored.payload && JSON.stringify(validatePaymentEvent(stored.payload))!==JSON.stringify(event)) throw new HttpError(409,"ID de evento reutilizado com payload diferente");
 const done=await processWebhook(event);
 res.status(done?200:202).json({success:true,pendente:!done});
};
export const getOrder: RequestHandler = async(req,res) => {
 await maintainRentals();
 const r=await prisma.alugueis.findUniqueOrThrow({where:{id:uuid(req.params.id)},include:rentalInclude});
 if(req.user!.tipo !== "admin" && ![r.locador_id,r.locatario_id].includes(req.user!.id)) throw new HttpError(403,"Acesso negado");
 res.json(serializeRental(r));
};

export const cancelPayment: RequestHandler = async(req,res) => {
 const p = await paymentForParty(req.params.id,req.user!.id,req.user!.tipo === "admin");
 if(p.alugueis.locatario_id !== req.user!.id && req.user!.tipo !== "admin") throw new HttpError(403,"Somente pagador pode cancelar cobrança");
 const result=await requestFinancial(p.id,"cancel");
 res.status(result.status === "cancelamento_pendente" ? 202 : 200).json({success:true,...serializePayment(result)});
};
export const simulatePayment: RequestHandler = async(req,res) => {
 if(!simulated()) throw new HttpError(403,"Simulação indisponível neste ambiente");
 const p=await paymentForParty(req.params.id,req.user!.id,req.user!.tipo === "admin");
 if(p.alugueis.locatario_id!==req.user!.id && req.user!.tipo!=="admin") throw new HttpError(403,"Acesso negado");
 if(p.gateway !== "demo") throw new HttpError(403,"Pagamento não pertence ao gateway demo");
 const status=text(req.body?.status,"Status",30);
 if(!["pago","falhou","cancelado"].includes(status))throw new HttpError(422,"Status inválido");
 res.json({success:true,...serializePayment(await applyPayment(p.id,status))});
};
