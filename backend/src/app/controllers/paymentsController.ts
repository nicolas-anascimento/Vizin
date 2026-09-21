import { audit } from "../utils/admin.ts";
import crypto from "node:crypto";
import type { Request, RequestHandler } from "express";
import prisma from "../config/database.ts";
import type { Prisma } from "../../generated/prisma/client.ts";
import { MercadoPagoGateway, verifyMercadoPagoSignature, providerId } from "../services/mercadoPagoGateway.ts";
import { claimPaymentOperation, operationFingerprint, waitFor } from "../services/gatewayOperations.ts";
import { assertPayable, contractedPrice, finePrice, paymentDeadline, rejectCardSecrets, isExpiredPix } from "../services/paymentRules.ts";
import { simulated, gatewayRequest, verifyWebhook, type GatewayResult } from "../services/paymentGateway.ts";
import { maintainRentals } from "../services/rentalMaintenance.ts";
import { FINANCIAL_BATCH_SIZE, FINANCIAL_LEASE_MS, nextRetry } from "../services/retryQueue.ts";
import { HttpError } from "../utils/httpError.ts";
import { parseDateOnly, rentalDays } from "../utils/dates.ts";
import { serializeRental, serializePayment, serializePublicPayment } from "../utils/serializers.ts";
import { uuid, text } from "../utils/validation.ts";
import { rentalInclude } from "./rentalsController.ts";

const ACTIVE_PAYMENT_STATES=["pago","pendente","cancelamento_pendente","estorno_pendente","conciliacao"];
const KNOWN_PAYMENT_STATES=["pendente","pago","falhou","cancelado","estornado","cancelamento_pendente","estorno_pendente","conciliacao","expirado"];

// Localiza o aluguel por ID ou pelo formato legado de objeto e período; exige que o pagador seja o locatário.
async function resolveRental(req: Request) {
 await maintainRentals();
 const id=req.params.id ?? req.body?.solicitacao_id ?? req.body?.aluguel_id ?? req.body?.pedido_id;
 const rental=id?await prisma.alugueis.findUnique({where:{id:uuid(id)},include:rentalInclude}):await prisma.alugueis.findFirst({where:{item_id:uuid(req.body?.objeto_id ?? req.body?.item_id),locatario_id:req.user!.id,data_inicio:parseDateOnly(req.body?.data_retirada ?? req.body?.retirada),data_fim:parseDateOnly(req.body?.data_devolucao ?? req.body?.devolucao),status:{in:["aprovado","pago"]}},include:rentalInclude});
 if(!rental)throw new HttpError(404,"Aluguel aprovado não encontrado","nao_encontrada");
 if(rental.locatario_id!==req.user!.id)throw new HttpError(403,"Somente locatário pode pagar","nao_pertence");
 if(!req.params.id && !["aprovado","pago"].includes(rental.status ?? ""))throw new HttpError(409,"Aluguel não pode ser pago");
 return rental;
}

// Valida o identificador do dispositivo enviado ao provedor de pagamento.
function deviceId(value:unknown):string|null {
 if(value===undefined || value===null || value==="")return null;
 const result=text(value,"Device ID",200);
 if(!/^[\w-]+$/.test(result))throw new HttpError(422,"Device ID inválido");
 return result;
}

// Guarda na impressão digital apenas o hash do token de cartão, sem persistir o segredo.
function tokenDigest(value:unknown):string|null {
 if(typeof value!=="string" || !value)return null;
 return crypto.createHash("sha256").update(value).digest("hex");
}

// Só considera o PIX utilizável quando código, QR e prazo válido vieram do provedor.
function completePix(result:GatewayResult):boolean {
 return typeof result.codigo_copia_cola==="string" && Boolean(result.codigo_copia_cola.trim()) &&
  typeof result.qr_code_base64==="string" && Boolean(result.qr_code_base64.trim()) &&
  typeof result.expira_em==="string" && Number.isFinite(new Date(result.expira_em).getTime()) && new Date(result.expira_em)>new Date();
}

// Consolida dados confiáveis do provedor no registro de pagamento para consultas posteriores.
function providerData(previous:unknown,result:GatewayResult):Record<string,unknown> {
 const details=(previous && typeof previous==="object"?previous:{}) as Record<string,unknown>;
 return {...details,provider_status:result.status,
  ...(result.codigo_copia_cola?{codigo_copia_cola:result.codigo_copia_cola,qr_code:result.codigo_copia_cola}:{}),
  ...(result.qr_code_base64?{qr_code_base64:result.qr_code_base64}:{}),
  ...(result.qrcode_url?{qrcode_url:result.qrcode_url}:{}),
  ...(result.expira_em?{expira_em:result.expira_em}:{}),
  ...(result.acao_necessaria?{acao_necessaria:result.acao_necessaria}:{})};
}

// Compara referência, moeda, valor e metadados do provedor com pagamento e locação locais.
async function validateMercadoPagoPayment(payment:any,trusted:GatewayResult) {
 const rental=await prisma.alugueis.findUniqueOrThrow({where:{id:payment.aluguel_id}});
 if(payment.gateway!=="mercado_pago" || trusted.referencia!==payment.referencia || trusted.valor!==Number(payment.valor) || trusted.moeda!=="BRL" || trusted.external_reference!==payment.id || trusted.metadata?.usuario_id!==rental.locatario_id || trusted.metadata?.aluguel_id!==rental.id || trusted.metadata?.tipo!==payment.tipo)throw new HttpError(422,"Identidade, referência ou valor do Mercado Pago incompatível","webhook_divergente");
}

// Consulta novamente o provedor e resolve a conciliação de um PIX criado sem todos os dados.
async function recoverIncompletePix(payment:any):Promise<any> {
 if(payment.gateway!=="mercado_pago" || payment.metodo!=="pix" || !payment.referencia)return payment;
 const trusted=await new MercadoPagoGateway().payment(payment.referencia);
 await validateMercadoPagoPayment(payment,trusted);
 if(!completePix(trusted))throw new HttpError(502,"Mercado Pago não retornou os dados completos do PIX","pix_incompleto");
 const updated=await prisma.$transaction(async tx=>{
  await tx.$queryRaw`SELECT id FROM alugueis WHERE id=${payment.aluguel_id}::uuid FOR UPDATE`;
  const current=await tx.pagamentos.findUniqueOrThrow({where:{id:payment.id}});
  const row=await tx.pagamentos.update({where:{id:payment.id},data:{status:current.status==="conciliacao"?"pendente":current.status,dados:providerData(current.dados,trusted) as Prisma.InputJsonValue}});
  await tx.conciliacoes_pagamento.updateMany({where:{pagamento_id:payment.id,status:"aberta",chave:{startsWith:"pix-incompleto:"}},data:{status:"resolvida"}});
  return row;
 });
 return updated;
}

type Prepared={payment:any;operationKey:string;boundRetry:boolean};
/*
 * Dentro de uma transação, bloqueia o aluguel, verifica titularidade, preço, multa e
 * cobranças ativas. A chave idempotente e a impressão digital impedem que uma nova
 * tentativa com a mesma chave crie outra cobrança ou mude seus parâmetros.
 * Registra a intenção local antes de qualquer chamada externa ao gateway.
 */
async function preparePayment(req:Request,method:"pix"|"cartao",modern:boolean,tipo:string,rental:any):Promise<Prepared> {
 const rawKey=modern?uuid(req.headers["idempotency-key"],"Idempotency-Key"):text(req.headers["idempotency-key"] ?? `${method}:${crypto.randomUUID()}`,"Idempotency-Key",150);
 // A chave pública pertence ao pagador; reutilizá-la em outro aluguel causa conflito.
 const key=modern?`v2:${req.user!.id}:${rawKey}`:`${rental.id}:${rawKey}`;
 return prisma.$transaction(async tx=>{
  if(method==="cartao" && req.body?.cartao_id)await tx.$queryRaw`SELECT id FROM usuarios WHERE id=${req.user!.id}::uuid FOR UPDATE`;
  await tx.$queryRaw`SELECT id FROM alugueis WHERE id=${rental.id}::uuid FOR UPDATE`;
  const current=await tx.alugueis.findUniqueOrThrow({where:{id:rental.id},include:{itens:{include:{usuarios:{select:{ativo:true}}}},devolucoes:true,multa:true}});
  if(current.locatario_id!==req.user!.id)throw new HttpError(403,"A solicitação não pertence a você.","nao_pertence");
  let saved:any=null,paymentMethod:string|null=null;
  if(method==="cartao") {
   if(req.body?.cartao_id) {
    saved=await tx.cartoes.findFirst({where:{id:text(req.body.cartao_id,"Cartão",200),usuario_id:req.user!.id}});
    if(!saved)throw new HttpError(403,"Cartão não pertence ao usuário.","nao_pertence");
    if(saved.exclusao_pendente)throw new HttpError(409,"Cartão em exclusão","cartao_indisponivel");
    if(saved.gateway!==(simulated()?"demo":"mercado_pago"))throw new HttpError(409,"Cartão pertence a outro ambiente");
    paymentMethod=saved.payment_method_id;
   } else paymentMethod=text(req.body?.payment_method_id ?? (modern?undefined:simulated()?"demo":"cartao"),"Método do cartão",80);
  }
  const device=deviceId(req.body?.device_id);
  // Verifica se a chave já foi usada; compara os parâmetros para impedir reuso com outro
  // aluguel, método, valor ou token, inclusive em tentativas simultâneas.
  const operation=await tx.operacoes_pagamento.findUnique({where:{chave:key}});
  const requested=operation?await tx.pagamentos.findUniqueOrThrow({where:{id:operation.pagamento_id}}):await tx.pagamentos.findUnique({where:{idempotencia:key}});
  if(requested) {
   const retryFingerprint=operationFingerprint({versao:"pagamentos-v2",origem:modern?"contrato_publico":"legado",aluguel_id:rental.id,tipo,metodo:method,cartao_id:saved?.id ?? null,payment_method_id:paymentMethod,token_digest:method==="cartao"?tokenDigest(req.body?.token_cartao ?? req.body?.tokenCartao):null,device_id:device,valor_centavos:Math.round(Number(requested.valor)*100),moeda:"BRL",regra:tipo==="multa"?"multa-v1":"aluguel-diaria-10pct-v1"});
   if(requested.aluguel_id!==rental.id || requested.metodo!==method || requested.tipo!==tipo || (operation?.fingerprint && operation.fingerprint!==retryFingerprint))throw new HttpError(409,"Chave idempotente utilizada para outra operação","idempotencia_conflitante");
   if(modern && !operation?.fingerprint)throw new HttpError(409,"Operação idempotente legada exige nova chave","idempotencia_conflitante");
   if(!operation)await tx.operacoes_pagamento.create({data:{chave:key,pagamento_id:requested.id,metodo:method,fingerprint:retryFingerprint,tipo_operacao:"criar"}});
   return {payment:requested,operationKey:key,boundRetry:true};
  }
  // Multa de devolução só é cobrada após a etapa ser confirmada. Uma contestação
  // suspende nova cobrança, e pagamento já concluído impede duplicidade.
  if(tipo==="multa" && current.status==="retirado")throw new HttpError(409,"Aguarde a confirmação da devolução","multa_aguarda_devolucao");
  const price=contractedPrice(current),fine=tipo==="multa"?finePrice(current):null;
  const value=fine?.valor_total ?? (modern?price.total:Number(current.valor_total));
  const fingerprint=operationFingerprint({versao:"pagamentos-v2",origem:modern?"contrato_publico":"legado",aluguel_id:rental.id,tipo,metodo:method,cartao_id:saved?.id ?? null,payment_method_id:paymentMethod,token_digest:method==="cartao"?tokenDigest(req.body?.token_cartao ?? req.body?.tokenCartao):null,device_id:device,valor_centavos:Math.round(value*100),moeda:"BRL",regra:tipo==="multa"?"multa-v1":"aluguel-diaria-10pct-v1"});
  if(modern && tipo==="aluguel")assertPayable(current,req.user!.id);
  else if(tipo==="multa") {
   if(fine?.status==="contestada")throw new HttpError(409,"Multa contestada; cobrança suspensa","multa_contestada");
   if(await tx.pagamentos.count({where:{aluguel_id:rental.id,tipo:"multa",status:"pago"}}))throw new HttpError(409,"A multa já foi paga.","ja_paga");
   if(!current.multa && fine)await tx.multas_aluguel.create({data:{aluguel_id:rental.id,dias_atraso:fine.dias_atraso,valor_dia:fine.valor_dia,valor_total:fine.valor_total,valor_plataforma:fine.valor_plataforma,valor_proprietario:fine.valor_proprietario,status:"pendente"}});
  } else if(!["aprovado","pago"].includes(current.status ?? ""))throw new HttpError(409,"Aluguel não pode ser pago","nao_aprovada");
  if(tipo==="aluguel" && paymentDeadline(current)<=new Date())throw new HttpError(409,"O prazo expirou.","prazo_expirado");
  if(await tx.conciliacoes_pagamento.count({where:{pagamento:{aluguel_id:rental.id},status:"aberta"}}))throw new HttpError(409,"Pagamento exige conciliação","conciliacao_pendente");
  // Reutiliza cobrança ativa para a mesma finalidade; não abre outra enquanto a anterior
  // estiver pendente, paga ou em conciliação.
  const existing=await tx.pagamentos.findFirst({where:{aluguel_id:rental.id,tipo,status:{in:ACTIVE_PAYMENT_STATES}},orderBy:{criado_em:"desc"}});
  if(existing) {
   if(existing.status==="conciliacao")throw new HttpError(409,"Pagamento exige conciliação","conciliacao_pendente");
   if(modern && method==="cartao" && existing.metodo==="cartao" && existing.status==="pendente")throw new HttpError(409,"Já existe pagamento de cartão pendente.","ja_paga");
   if(existing.metodo===method && existing.status==="pendente" && !isExpiredPix(existing))await tx.operacoes_pagamento.upsert({where:{chave:key},create:{chave:key,pagamento_id:existing.id,metodo:method,fingerprint,tipo_operacao:"criar"},update:{}});
   return {payment:existing,operationKey:key,boundRetry:false};
  }
  const gateway=simulated()?"demo":modern || process.env.MP_ACCESS_TOKEN?"mercado_pago":"real";
  const created=await tx.pagamentos.create({data:{aluguel_id:rental.id,tipo,valor:value,metodo:method,idempotencia:key,status:"pendente",gateway,cartao_id:saved?.id ?? null,dados:modern?{contrato:"pagamentos-v2",...(fine ?? price)}:{}}});
  await tx.operacoes_pagamento.create({data:{chave:key,pagamento_id:created.id,metodo:method,fingerprint,tipo_operacao:"criar"}});
  return {payment:created,operationKey:key,boundRetry:false};
 });
}

/*
 * Obtém um lease para que apenas uma requisição envie a intenção ao gateway.
 * A chamada externa ocorre fora da transação; depois a referência e os dados do
 * provedor são persistidos. Outras requisições aguardam ou reutilizam o resultado.
 */
async function submitPayment(req:Request,prepared:Prepared,rental:any,tipo:string):Promise<any> {
 let payment=prepared.payment;
 if(payment.status==="conciliacao")return recoverIncompletePix(payment);
 if(payment.referencia || payment.status!=="pendente")return payment;
 // Se outra requisição já possui o lease, espera o resultado registrado e evita
 // uma segunda cobrança externa com a mesma intenção.
 if(!await claimPaymentOperation(prepared.operationKey)) {
  const operation=await waitFor(()=>prisma.operacoes_pagamento.findUniqueOrThrow({where:{chave:prepared.operationKey}}),row=>row.estado!=="processando");
  payment=await prisma.pagamentos.findUniqueOrThrow({where:{id:payment.id}});
  if(payment.status==="conciliacao")return recoverIncompletePix(payment);
  if(!payment.referencia)throw new HttpError(operation.estado==="falhou"?502:409,"Criação da cobrança ainda não concluída",operation.estado==="falhou"?"gateway_indisponivel":"operacao_pendente");
  return payment;
 }
 try {
  payment=await prisma.pagamentos.findUniqueOrThrow({where:{id:payment.id}});
  if(payment.referencia){await prisma.operacoes_pagamento.update({where:{chave:prepared.operationKey},data:{estado:"concluida",lease_ate:null}});return payment;}
  const user=await prisma.usuarios.findUniqueOrThrow({where:{id:req.user!.id}});
  const saved=payment.cartao_id?await prisma.cartoes.findFirst({where:{id:payment.cartao_id,usuario_id:user.id}}):null;
  if(payment.cartao_id && !saved)throw new HttpError(409,"Cartão escolhido não está mais disponível","cartao_indisponivel");
  if(saved?.gateway==="mercado_pago")await new MercadoPagoGateway().verifyCustomer(saved.customer_id,user);
  const expiration=new Date(Date.now()+(payment.gateway==="mercado_pago"?1805000:1800000)).toISOString();
  const result:GatewayResult=payment.gateway==="demo"?{referencia:payment.id,status:"pendente",codigo_copia_cola:`SIMULADO|VIZIN|${payment.id}|${Number(payment.valor).toFixed(2)}`,qr_code_base64:"U0lNVUxBRE8=",expira_em:expiration}:await gatewayRequest("payments",{id:payment.id,aluguelId:rental.id,tipo,valor:Number(payment.valor),metodo:payment.metodo,tokenCartao:req.body?.token_cartao ?? req.body?.tokenCartao,payment_method_id:saved?.payment_method_id ?? req.body?.payment_method_id,device_id:deviceId(req.body?.device_id),expira_em:expiration,pagador:{id:user.id,email:user.email,cpf:user.cpf,nome:user.nome,...(saved?{customer_id:saved.customer_id}:{})}},payment.idempotencia!,payment.gateway);
  if(saved && payment.gateway==="mercado_pago" && result.cartao_id!==saved.id)throw new HttpError(422,"Cartão do provedor diverge do cartão escolhido");
  const incomplete=payment.metodo==="pix" && !completePix(result);
  // Grava referência e dados do provedor sob bloqueio do aluguel. PIX incompleto
  // entra em conciliação para não ser apresentado como cobrança utilizável.
  payment=await prisma.$transaction(async tx=>{
   await tx.$queryRaw`SELECT id FROM alugueis WHERE id=${payment.aluguel_id}::uuid FOR UPDATE`;
   const current=await tx.pagamentos.findUniqueOrThrow({where:{id:payment.id}});
   const updated=await tx.pagamentos.update({where:{id:payment.id},data:{referencia:result.referencia,status:incomplete && current.status==="pendente"?"conciliacao":current.status,dados:providerData(current.dados,result) as Prisma.InputJsonValue}});
   if(incomplete)await tx.conciliacoes_pagamento.upsert({where:{chave:`pix-incompleto:${payment.id}`},create:{pagamento_id:payment.id,chave:`pix-incompleto:${payment.id}`,motivo:"Mercado Pago retornou PIX sem todos os dados necessários",dados:{referencia:result.referencia}},update:{status:"aberta"}});
   return updated;
  });
  await prisma.operacoes_pagamento.update({where:{chave:prepared.operationKey},data:{estado:incomplete?"falhou":"concluida",lease_ate:null}});
  if(incomplete)throw new HttpError(502,"Mercado Pago não retornou os dados completos do PIX","pix_incompleto");
  await reconcilePaymentWebhooks(payment.referencia!);
  if(payment.gateway==="mercado_pago" && payment.referencia && payment.status==="pendente") {
   const trusted=await new MercadoPagoGateway().payment(payment.referencia);
   await validateMercadoPagoPayment(payment,trusted);
   if(["falhou","cancelado"].includes(trusted.status))await applyPayment(payment.id,trusted.status);
  } else if(["falhou","cancelado"].includes(result.status))await applyPayment(payment.id,result.status);
  return prisma.pagamentos.findUniqueOrThrow({where:{id:payment.id}});
 } catch(error) {
  await prisma.operacoes_pagamento.updateMany({where:{chave:prepared.operationKey,estado:"processando"},data:{estado:"falhou",lease_ate:null}});
  throw error;
 }
}

// Orquestra validação, criação da intenção e envio; troca de método exige cancelar a cobrança anterior.
async function createPayment(req:Request,method:"pix"|"cartao",modern=false,tipo="aluguel"):Promise<any> {
 rejectCardSecrets(req.body);
 if(method==="cartao")text(req.body?.token_cartao ?? req.body?.tokenCartao,"Token do cartão",1000);
 const rental=await resolveRental(req);
 const prepared=await preparePayment(req,method,modern,tipo,rental);
 let payment=prepared.payment;
 if(["cancelamento_pendente","estorno_pendente"].includes(payment.status ?? ""))throw new HttpError(409,"Operação financeira pendente; aguarde confirmação","operacao_pendente");
 if(payment.metodo!==method || (!prepared.boundRetry && isExpiredPix(payment))) {
  if(payment.status!=="pendente")throw new HttpError(409,"Método diferente já pago; solicite estorno","ja_paga");
  const canceled=await requestFinancial(payment.id,"cancel");
  if(canceled.status!=="cancelado")throw new HttpError(409,"Cancelamento pendente; aguarde antes de trocar método","operacao_pendente");
  return createPayment(req,method,modern,tipo);
 }
 payment=await submitPayment(req,prepared,rental,tipo);
 if(!modern && ["falhou","cancelado","estornado"].includes(payment.status ?? ""))throw new HttpError(402,"Cobrança recusada ou encerrada pelo gateway");
 return payment;
}

/*
 * Aplica um estado financeiro confirmado em transação com bloqueio do aluguel.
 * Eventos repetidos são reconhecidos pelo ID do webhook. Estados incompatíveis
 * ou confirmações tardias exigem conciliação, preservando a consistência do aluguel.
 * A transação também atualiza multa, locação e notificações quando cabível.
 */
export async function applyPayment(id:string,status:string,eventId?:string) {
 if(!KNOWN_PAYMENT_STATES.includes(status) || ["cancelamento_pendente","estorno_pendente","conciliacao","expirado"].includes(status))throw new HttpError(422,"Estado financeiro inválido","estado_financeiro_desconhecido");
 return prisma.$transaction(async tx=>{
  const initial=await tx.pagamentos.findUniqueOrThrow({where:{id}});
  await tx.$queryRaw`SELECT id FROM alugueis WHERE id=${initial.aluguel_id}::uuid FOR UPDATE`;
  if(eventId) {
   const existed=await tx.webhook_eventos.findUnique({where:{id:eventId}});
   if(existed?.processado_em || (existed && !existed.payload))return tx.pagamentos.findUniqueOrThrow({where:{id}});
   await tx.webhook_eventos.upsert({where:{id:eventId},create:{id:eventId,processado_em:new Date()},update:{processado_em:new Date()}});
  }
  const current=await tx.pagamentos.findUniqueOrThrow({where:{id}});
  if(current.status===status)return current;
  const rental=await tx.alugueis.findUniqueOrThrow({where:{id:current.aluguel_id}});
  const allowed:Record<string,string[]>={pendente:["pago","falhou","cancelado"],cancelamento_pendente:["cancelado","pago","falhou"],pago:["estornado"],estorno_pendente:["estornado"]};
  // Eventos fora de ordem, pagamento após o prazo e estorno após retirada não podem
  // alterar silenciosamente a locação; são registrados para conciliação.
  const incompatible=!(allowed[current.status ?? "pendente"] ?? []).includes(status);
  const late=status==="pago" && (current.status==="cancelamento_pendente" || (current.tipo==="aluguel" && (rental.status!=="aprovado" || paymentDeadline(rental)<new Date())));
  const unsafeRefund=current.tipo==="aluguel" && status==="estornado" && !["pago","cancelado"].includes(rental.status ?? "");
  if(incompatible || late || unsafeRefund) {
   if(!eventId && incompatible)throw new HttpError(409,"Transição de pagamento inválida");
   await tx.conciliacoes_pagamento.upsert({where:{chave:`${id}:${status}:${current.status}`},create:{pagamento_id:id,chave:`${id}:${status}:${current.status}`,motivo:late?"Pagamento recebido fora do prazo ou durante cancelamento":unsafeRefund?"Estorno após retirada":"Evento financeiro fora de ordem",dados:{status,eventId:eventId??null}},update:{}});
  }
  const competing=status==="pago" && Boolean(await tx.pagamentos.findFirst({where:{aluguel_id:rental.id,tipo:current.tipo,id:{not:id},status:{in:ACTIVE_PAYMENT_STATES}}}));
  const receipt=status==="pago" && ["cancelado","falhou"].includes(current.status ?? "");
  if(incompatible && !receipt)return current;
  const updated=await tx.pagamentos.update({where:{id},data:{status:competing?"conciliacao":status,...(status==="pago"?{pago_em:new Date()}:{})}});
  if(current.tipo==="aluguel" && ["pago","estornado"].includes(status) && !late && !unsafeRefund && !incompatible && !competing) {
   const next=status==="pago"?"pago":"cancelado",details=current.dados as Record<string,any>;
   await tx.alugueis.update({where:{id:rental.id},data:{status:next,atualizado_em:new Date(),...(status==="pago" && details.contrato?.startsWith("pagamentos-v")?{taxa_plataforma:details.taxa_servico,ganho_locador:details.subtotal}:{})}});
   await tx.eventos_aluguel.create({data:{aluguel_id:rental.id,status:next,motivo:`Pagamento ${status}`}});
  }
  // O pagamento da multa libera a pendência; um estorno posterior a torna pendente
  // novamente e gera aviso ao locatário.
  if(current.tipo==="multa" && status==="pago" && !incompatible && !competing) {
   await tx.multas_aluguel.updateMany({where:{aluguel_id:rental.id,status:"pendente"},data:{status:"paga"}});
   await tx.notificacoes.create({data:{usuario_id:rental.locatario_id,tipo:"multa_paga",titulo:"Multa paga",mensagem:"O pagamento da multa foi confirmado.",contexto:{solicitacao_id:rental.id,aluguelId:rental.id}}});
  }
  if(current.tipo==="multa" && status==="estornado" && !incompatible) {
   await tx.multas_aluguel.updateMany({where:{aluguel_id:rental.id,status:"paga"},data:{status:"pendente"}});
   await tx.notificacoes.create({data:{usuario_id:rental.locatario_id,tipo:"bloqueio_conta",titulo:"Multa pendente",mensagem:"A multa foi estornada e precisa de nova resolução.",contexto:{solicitacao_id:rental.id,pagamentoId:id}}});
  }
  if(current.tipo==="aluguel" && status==="estornado" && !unsafeRefund && !incompatible && !competing) {
   await tx.notificacoes.createMany({skipDuplicates:true,data:[rental.locador_id,rental.locatario_id].map(usuario_id=>({usuario_id,chave:`${rental.id}:cancelamento:${usuario_id}`,tipo:"aluguel_cancelado",titulo:"Solicitação cancelada",mensagem:"O estorno foi confirmado e a solicitação cancelada.",contexto:{solicitacao_id:rental.id,pagamentoId:id}}))});
  }
  await tx.notificacoes.createMany({data:[rental.locador_id,rental.locatario_id].map(usuario_id=>({usuario_id,tipo:"pagamento",titulo:"Pagamento atualizado",mensagem:`Pagamento ${status}${late || unsafeRefund?"; exige conciliação":""}.`,contexto:{aluguelId:rental.id,objetoId:rental.item_id,pagamentoId:id}}))});
  return updated;
 });
}

/*
 * Persiste a intenção de cancelar ou estornar antes de chamar o provedor.
 * O lease e a chave idempotente permitem repetição segura após falha ou timeout.
 * O estado final só é aplicado depois da resposta do gateway ou de reconciliação.
 */
export async function requestFinancial(id:string,operation:"cancel"|"refund",adminId?:string) {
 // Usa estados intermediários persistidos para distinguir intenção financeira de
 // confirmação efetiva do provedor, inclusive após timeout.
 const pending=operation==="cancel"?"cancelamento_pendente":"estorno_pendente",terminal=operation==="cancel"?"cancelado":"estornado";
 const operationKey=`financial:${operation}:${id}`,fingerprint=operationFingerprint({pagamento_id:id,operacao:operation,versao:1});
 let payment=await prisma.$transaction(async tx=>{
  const initial=await tx.pagamentos.findUniqueOrThrow({where:{id}});
  await tx.$queryRaw`SELECT id FROM alugueis WHERE id=${initial.aluguel_id}::uuid FOR UPDATE`;
  const current=await tx.pagamentos.findUniqueOrThrow({where:{id},include:{alugueis:true}});
  if(current.status===terminal)return current;
  if(![operation==="cancel"?"pendente":"pago",pending].includes(current.status ?? ""))throw new HttpError(409,"Operação financeira não permitida");
  if(operation==="refund" && current.tipo==="aluguel" && !["pago","cancelado"].includes(current.alugueis.status ?? ""))throw new HttpError(409,"Estorno não permitido após retirada");
  if(!["demo","real","mercado_pago"].includes(current.gateway))throw new HttpError(409,"Gateway legado exige análise antes de operação financeira");
  if(current.gateway==="real" && !current.referencia)throw new HttpError(409,"Criação de cobrança ainda não concluída");
  const existing=await tx.operacoes_pagamento.findUnique({where:{chave:operationKey}});
  if(existing?.fingerprint && existing.fingerprint!==fingerprint)throw new HttpError(409,"Operação financeira incompatível","idempotencia_conflitante");
  await tx.operacoes_pagamento.upsert({where:{chave:operationKey},create:{chave:operationKey,pagamento_id:id,metodo:current.metodo ?? "pix",fingerprint,tipo_operacao:operation==="cancel"?"cancelar":"estornar"},update:{}});
  if (current.status===pending) return current;
  const changed=await tx.pagamentos.update({where:{id},data:{status:pending}});
  if (adminId) await audit(tx,adminId,"solicitar_estorno","pagamento",id,{status:pending});
  return changed;
 });
 if(payment.status===terminal)return payment;
 if(payment.gateway==="demo") {const result=await applyPayment(id,terminal);await prisma.operacoes_pagamento.update({where:{chave:operationKey},data:{estado:"concluida",lease_ate:null}});return result;}
 if(!await claimPaymentOperation(operationKey))return prisma.pagamentos.findUniqueOrThrow({where:{id}});
 try {
  payment=await prisma.pagamentos.findUniqueOrThrow({where:{id}});
  if(payment.status===terminal){await prisma.operacoes_pagamento.update({where:{chave:operationKey},data:{estado:"concluida",lease_ate:null}});return payment;}
  if(payment.gateway==="mercado_pago" && !payment.referencia) {
   const recovered=await new MercadoPagoGateway().findPayment(payment.id);
   if(!recovered)throw new HttpError(409,"Criação da cobrança ainda não confirmada; operação continua pendente","operacao_pendente");
   const snapshot={...payment,referencia:recovered.referencia};await validateMercadoPagoPayment(snapshot,recovered);
   payment=await prisma.pagamentos.update({where:{id},data:{referencia:recovered.referencia}});
  }
  const result=await gatewayRequest(`payments/${encodeURIComponent(payment.referencia!)}/${operation}`,{},`${operation}:${id}`,payment.gateway);
  if(result.referencia!==payment.referencia)throw new HttpError(502,"Referência da operação diverge da cobrança; operação continua pendente");
  if(payment.gateway==="mercado_pago")await validateMercadoPagoPayment(payment,result);
  if(result.status===terminal) {const applied=await applyPayment(id,terminal);await prisma.operacoes_pagamento.update({where:{chave:operationKey},data:{estado:"concluida",lease_ate:null}});return applied;}
  await prisma.operacoes_pagamento.update({where:{chave:operationKey},data:{estado:"pendente",lease_ate:null}});
  return prisma.pagamentos.findUniqueOrThrow({where:{id}});
 } catch(error) {
  await prisma.operacoes_pagamento.updateMany({where:{chave:operationKey,estado:"processando"},data:{estado:"falhou",lease_ate:null}});
  throw error;
 }
}

// DTO resumido do objeto exibido no pagamento; prioriza a foto principal.
const productDto=(r:any)=>({id:r.itens.id,titulo:r.itens.titulo,categoria:r.itens.categorias?.nome ?? "Sem categoria",imagem:[...r.itens.fotos_item].sort((a:any,b:any)=>Number(!!b.principal)-Number(!!a.principal))[0]?.url ?? null});
// Retorna preço contratado e prazo restante calculados pelo servidor para a tela de pagamento.
export const rentalPaymentSummary:RequestHandler=async(req,res)=>{const rental=await resolveRental(req);assertPayable(rental,req.user!.id);res.json({produto:productDto(rental),...contractedPrice(rental),data_retirada:rental.data_inicio.toISOString().slice(0,10),data_devolucao:rental.data_fim.toISOString().slice(0,10),prazo_restante_segundos:Math.max(0,Math.floor((paymentDeadline(rental).getTime()-Date.now())/1000))});};
// Confirma ao locatário o pagamento já registrado e apresenta datas e total efetivamente pago.
export const rentalPaymentConfirmation:RequestHandler=async(req,res)=>{
 const rental=await prisma.alugueis.findUnique({where:{id:uuid(req.params.id)},select:{locatario_id:true,status:true,data_inicio:true,data_fim:true,itens:{select:{id:true,titulo:true}},pagamentos:{where:{tipo:"aluguel",status:"pago"},select:{valor:true},orderBy:{criado_em:"desc"},take:1}}});
 if(!rental)throw new HttpError(404,"Solicitação não encontrada.","nao_encontrada");
 if(rental.locatario_id!==req.user!.id)throw new HttpError(403,"A solicitação não pertence a você.","nao_pertence");
 if(!["pago","retirado","devolvido","finalizado"].includes(rental.status ?? ""))throw new HttpError(409,"A solicitação ainda não está paga.","nao_paga");
 const payment=rental.pagamentos[0];
 if(!payment)throw new HttpError(409,"A solicitação ainda não está paga.","nao_paga");
 res.json({produto:{id:rental.itens.id,titulo:rental.itens.titulo},data_retirada:rental.data_inicio.toISOString().slice(0,10),data_devolucao:rental.data_fim.toISOString().slice(0,10),dias:rentalDays(rental.data_inicio,rental.data_fim),total_pago:Number(payment.valor)});
};
// Mostra a multa persistida ou seu cálculo atual para a solicitação do locatário.
export const fineSummary:RequestHandler=async(req,res)=>{const rental=await resolveRental(req);const full=await prisma.alugueis.findUniqueOrThrow({where:{id:rental.id},include:{devolucoes:true,multa:true}});res.json({produto:productDto(rental),...finePrice(full)});};
// Endpoint do contrato atual: valida método, diferencia aluguel de multa e devolve o DTO público.
export const createContractPayment:RequestHandler=async(req,res)=>{const method=req.body?.metodo;if(!["pix","cartao"].includes(method))throw new HttpError(422,"Método inválido");if(!simulated() && typeof req.body?.token_cartao==="string" && req.body.token_cartao.startsWith("tok_demo_"))throw new HttpError(422,"Token de demonstração não é aceito no gateway real","token_demo_invalido");const tipo=req.path.includes("/multa/")?"multa":"aluguel";let payment=await createPayment(req,method,true,tipo);if(payment.gateway==="demo" && payment.metodo==="cartao" && payment.status==="pendente"){const token=req.body?.token_cartao;payment=token==="tok_demo_pending"?payment:await applyPayment(payment.id,token==="tok_demo_refused"?"falhou":"pago");}res.json(serializePublicPayment(payment));};
// Alias legado para gerar PIX; preserva os campos de resposta esperados pelo cliente anterior.
export const generatePix:RequestHandler=async(req,res)=>{const payment=await createPayment(req,"pix");res.json({success:true,...serializePayment(payment),pagamento_id:payment.id,pedido_id:payment.aluguel_id});};
// Alias legado para pagamento por token de cartão, com simulação restrita ao ambiente demo.
export const payCard:RequestHandler=async(req,res)=>{text(req.body?.token_cartao ?? req.body?.tokenCartao,"Token do cartão",1000);const payment=await createPayment(req,"cartao");const result=simulated() && payment.gateway==="demo" && payment.metodo==="cartao" && payment.status==="pendente"?await applyPayment(payment.id,"pago"):payment;res.json({success:true,...serializePayment(result),pedido_id:payment.aluguel_id});};
// Confirmação manual exclusiva do gateway simulado em desenvolvimento.
export const confirmPix:RequestHandler=async(req,res)=>{if(!simulated())throw new HttpError(403,"Confirmação manual só permitida no gateway simulado de desenvolvimento");const rental=await resolveRental(req);const payment=await prisma.pagamentos.findFirst({where:{aluguel_id:rental.id,metodo:"pix",status:{in:["pendente","pago"]}}});if(!payment)throw new HttpError(409,"Gere o PIX antes de confirmar");if(payment.gateway!=="demo")throw new HttpError(403,"Pagamento não pertence ao gateway demo");const updated=await applyPayment(payment.id,"pago");res.json({success:true,...serializePayment(updated),pedido_id:rental.id});};

// Busca a cobrança pelo UUID e impede que outro usuário consulte ou opere o pagamento.
async function paymentForPayer(id:unknown,userId:string) {const payment=await prisma.pagamentos.findUnique({where:{id:uuid(id)},include:{alugueis:true}});if(!payment)throw new HttpError(404,"Pagamento não encontrado","nao_encontrada");if(payment.alugueis.locatario_id!==userId)throw new HttpError(403,"Acesso negado","nao_pertence");return payment;}
// Adapta a resposta ao contrato da rota de status ou ao DTO público da cobrança.
export const paymentStatus:RequestHandler=async(req,res)=>{const payment=await paymentForPayer(req.params.id,req.user!.id);res.json(req.path.endsWith("/status")?serializePayment(payment):serializePublicPayment(payment));};
// Solicita estorno do próprio aluguel; multa exige análise administrativa.
export const refundPayment:RequestHandler=async(req,res)=>{const payment=await paymentForPayer(req.params.id,req.user!.id);if(payment.tipo==="multa")throw new HttpError(403,"Estorno de multa exige análise administrativa","estorno_multa_admin_required");const result=await requestFinancial(payment.id,"refund");res.status(result.status==="estorno_pendente"?202:200).json({success:true,...serializePayment(result)});};
// Permite estorno administrativo com registro de auditoria na operação financeira.
export const adminRefundPayment:RequestHandler=async(req,res)=>{const payment=await prisma.pagamentos.findUnique({where:{id:uuid(req.params.id)}});if(!payment)throw new HttpError(404,"Pagamento não encontrado","nao_encontrada");const result=await requestFinancial(payment.id,"refund",req.user!.id);res.status(result.status==="estorno_pendente"?202:200).json({success:true,id:result.id,status:result.status,valor:Number(result.valor),gateway:result.gateway});};
// Solicita cancelamento da cobrança do locatário e indica com 202 quando ainda está pendente.
export const cancelPayment:RequestHandler=async(req,res)=>{const payment=await paymentForPayer(req.params.id,req.user!.id);const result=await requestFinancial(payment.id,"cancel");res.status(result.status==="cancelamento_pendente"?202:200).json({success:true,...serializePayment(result)});};
// Altera pagamentos demo para testar transições sem atingir o provedor real.
export const simulatePayment:RequestHandler=async(req,res)=>{if(!simulated())throw new HttpError(403,"Simulação indisponível neste ambiente");const payment=await paymentForPayer(req.params.id,req.user!.id);if(payment.gateway!=="demo")throw new HttpError(403,"Pagamento não pertence ao gateway demo");const status=text(req.body?.status,"Status",30);if(!["pago","falhou","cancelado"].includes(status))throw new HttpError(422,"Status inválido");res.json({success:true,...serializePayment(await applyPayment(payment.id,status))});};

export type PaymentEvent={id:string;referencia:string;valor:number;status:string};
// Valida formato, valor em centavos e status aceitos de um webhook do gateway genérico.
export function validatePaymentEvent(input:unknown):PaymentEvent {if(!input || typeof input!=="object" || Array.isArray(input))throw new HttpError(400,"Evento deve ser objeto JSON");const event=input as Record<string,unknown>;const id=text(event.id,"Evento",150),referencia=text(event.referencia,"Referência",200),status=text(event.status,"Status",30);if(typeof event.valor!=="number" || !Number.isFinite(event.valor) || event.valor<=0 || Math.abs(event.valor*100-Math.round(event.valor*100))>0.000001)throw new HttpError(422,"Valor inválido");if(!["pendente","pago","falhou","cancelado","estornado"].includes(status))throw new HttpError(422,"Status inválido");return{id,referencia,valor:event.valor,status};}
// Relaciona a referência do evento à cobrança local antes de aplicar o estado informado.
async function processWebhook(event:PaymentEvent):Promise<boolean>{const payment=await prisma.pagamentos.findUnique({where:{referencia:event.referencia}});if(!payment)return false;if(payment.gateway!=="real")throw new HttpError(422,"Webhook exige pagamento real");if(event.valor!==Number(payment.valor))throw new HttpError(422,"Valor do provedor diverge do pagamento");await applyPayment(payment.id,event.status,event.id);return true;}
// Consulta o pagamento diretamente no Mercado Pago; divergências geram conciliação.
async function processMercadoPagoWebhook(eventId:string,reference:string):Promise<boolean>{const trusted=await new MercadoPagoGateway().payment(reference);const payment=await prisma.pagamentos.findUnique({where:{referencia:reference}});if(!payment)return false;try{await validateMercadoPagoPayment(payment,trusted);}catch(error){await prisma.conciliacoes_pagamento.upsert({where:{chave:`mp-divergente:${eventId}`},create:{pagamento_id:payment.id,chave:`mp-divergente:${eventId}`,motivo:"Webhook MP com identidade ou valor divergente",dados:{eventId}},update:{}});throw error;}await applyPayment(payment.id,trusted.status,eventId);return true;}
// Job de webhooks pendentes: reivindica lotes com lease e agenda nova tentativa com recuo progressivo.
export async function reconcilePaymentWebhooks(reference?:string){
 const now=new Date();
 const eligible={processado_em:null,OR:[{proxima_tentativa_em:null},{proxima_tentativa_em:{lte:now}}],AND:[{OR:[{lease_ate:null},{lease_ate:{lt:now}}]}]};
 const where=reference?{AND:[eligible,{OR:[{payload:{path:["resourceId"],equals:reference}},{payload:{path:["referencia"],equals:reference}}]}]}:eligible;
 // Busca só eventos prontos para nova tentativa. O lease é reivindicado por update
 // condicional, evitando que duas execuções processem o mesmo evento.
 const rows=await prisma.webhook_eventos.findMany({where,take:FINANCIAL_BATCH_SIZE,orderBy:[{tentativas:"asc"},{proxima_tentativa_em:"asc"},{criado_em:"asc"}]});
 let failed=0;
 for(const row of rows){
  const leaseUntil=new Date(now.getTime()+FINANCIAL_LEASE_MS);
  const claimed=await prisma.webhook_eventos.updateMany({where:{id:row.id,processado_em:null,OR:[{lease_ate:null},{lease_ate:{lt:now}}],AND:[{OR:[{proxima_tentativa_em:null},{proxima_tentativa_em:{lte:now}}]}]},data:{lease_ate:leaseUntil,tentativas:{increment:1},proxima_tentativa_em:nextRetry(row.tentativas+1,now)}});
  if(!claimed.count)continue;
  try{
   if(!row.payload)continue;
   const payload=row.payload as Record<string,any>;
   if(payload.provider==="mercado_pago")await processMercadoPagoWebhook(row.id,payload.resourceId);
   else await processWebhook(validatePaymentEvent(row.payload));
  }catch{failed++;}
  finally{await prisma.webhook_eventos.updateMany({where:{id:row.id,lease_ate:leaseUntil},data:{lease_ate:null}});}
 }
 if(failed)console.error("Webhooks pendentes exigem análise",failed);
}
// Job de PIX incompletos: consulta o provedor em lotes e libera o lease após cada tentativa.
export async function reconcileIncompletePayments(){
 const now=new Date();
 // Um lote limitado de PIX incompletos recebe lease e nova data de tentativa;
 // cada registro é recuperado isoladamente para que uma falha não pare os demais.
 const rows=await prisma.pagamentos.findMany({where:{gateway:"mercado_pago",metodo:"pix",status:"conciliacao",referencia:{not:null},OR:[{conciliacao_proxima_em:null},{conciliacao_proxima_em:{lte:now}}],AND:[{OR:[{conciliacao_lease_ate:null},{conciliacao_lease_ate:{lt:now}}]}]},take:FINANCIAL_BATCH_SIZE,orderBy:[{conciliacao_tentativas:"asc"},{conciliacao_proxima_em:"asc"},{criado_em:"asc"}]});
 let failed=0;
 for(const payment of rows){
  const leaseUntil=new Date(now.getTime()+FINANCIAL_LEASE_MS);
  const claimed=await prisma.pagamentos.updateMany({where:{id:payment.id,status:"conciliacao",OR:[{conciliacao_proxima_em:null},{conciliacao_proxima_em:{lte:now}}],AND:[{OR:[{conciliacao_lease_ate:null},{conciliacao_lease_ate:{lt:now}}]}]},data:{conciliacao_tentativas:{increment:1},conciliacao_proxima_em:nextRetry(payment.conciliacao_tentativas+1,now),conciliacao_lease_ate:leaseUntil}});
  if(!claimed.count)continue;
  try{await recoverIncompletePix(payment);}catch{failed++;}
  finally{await prisma.pagamentos.updateMany({where:{id:payment.id,conciliacao_lease_ate:leaseUntil},data:{conciliacao_lease_ate:null}});}
 }
 if(failed)console.error("PIX pendentes exigem análise",failed);
}

// Recebe corpo bruto para verificar assinatura antes de interpretar o JSON; IDs repetidos mantêm idempotência.
export const paymentWebhook:RequestHandler=async(req,res)=>{if(!Buffer.isBuffer(req.body))throw new HttpError(400,"Corpo inválido");if(req.headers["x-signature"] || req.query["data.id"]!==undefined){await mercadoPagoWebhook(req,res);return;}verifyWebhook(req.body,req.headers["x-webhook-signature"]);let input:unknown;try{input=JSON.parse(req.body.toString("utf8"));}catch{throw new HttpError(400,"JSON inválido");}const event=validatePaymentEvent(input);const known=await prisma.pagamentos.findUnique({where:{referencia:event.referencia}});if(known && (known.gateway!=="real" || Number(known.valor)!==event.valor))throw new HttpError(422,"Gateway ou valor incompatível");const stored=await prisma.webhook_eventos.upsert({where:{id:event.id},create:{id:event.id,payload:event},update:{}});if(stored.payload && JSON.stringify(validatePaymentEvent(stored.payload))!==JSON.stringify(event))throw new HttpError(409,"ID de evento reutilizado com payload diferente");const done=await processWebhook(event);res.status(done?200:202).json({success:true,pendente:!done});};
// Verifica assinatura e identidade do recurso do Mercado Pago antes de consultar o estado confiável.
async function mercadoPagoWebhook(req:Request,res:import("express").Response):Promise<void>{let input:any;try{input=JSON.parse(req.body.toString("utf8"));}catch{throw new HttpError(400,"JSON inválido");}const verified=verifyMercadoPagoSignature(req.query["data.id"],req.headers["x-signature"],req.headers["x-request-id"]);if(!input || typeof input!=="object" || Array.isArray(input) || input.type!=="payment")throw new HttpError(422,"Notificação MP incompatível");let resourceId:string,notificationId:string;try{resourceId=providerId(input.data?.id);notificationId=providerId(input.id);}catch{throw new HttpError(422,"Notificação MP incompatível");}if(resourceId!==verified.resourceId)throw new HttpError(422,"Notificação MP incompatível");const eventId=`mp:${notificationId}`,payload={provider:"mercado_pago",resourceId:verified.resourceId};const stored=await prisma.webhook_eventos.upsert({where:{id:eventId},create:{id:eventId,payload},update:{}});const existing=stored.payload as Record<string,unknown>|null;if(existing?.provider!==payload.provider || existing?.resourceId!==payload.resourceId)throw new HttpError(409,"ID de evento reutilizado com recurso diferente");if(stored.processado_em){res.json({success:true});return;}const done=await processMercadoPagoWebhook(eventId,verified.resourceId);res.status(done?200:202).json({success:true,pendente:!done});}

// Alias de consulta do pedido: só participantes ou administrador recebem o DTO do aluguel.
export const getOrder:RequestHandler=async(req,res)=>{await maintainRentals();const rental=await prisma.alugueis.findUniqueOrThrow({where:{id:uuid(req.params.id)},include:rentalInclude});if(req.user!.tipo!=="admin" && ![rental.locador_id,rental.locatario_id].includes(req.user!.id))throw new HttpError(403,"Acesso negado");res.json(serializeRental(rental));};
