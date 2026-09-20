import crypto from "node:crypto";
import type { RequestHandler } from "express";
import prisma from "../config/database.ts";
import { MercadoPagoGateway, type SafeCard } from "../services/mercadoPagoGateway.ts";
import { claimGatewayOperation, operationFingerprint, waitFor } from "../services/gatewayOperations.ts";
import { rejectCardSecrets } from "../services/paymentRules.ts";
import { simulated } from "../services/paymentGateway.ts";
import { text } from "../utils/validation.ts";
import { HttpError } from "../utils/httpError.ts";
import { FINANCIAL_BATCH_SIZE, nextRetry } from "../services/retryQueue.ts";

// Exibe apenas metadados não sensíveis do cartão salvo.
const cardDto=(card:any)=>({id:card.id,bandeira:card.bandeira,ultimos_digitos:card.ultimos_digitos,validade:card.validade,padrao:card.padrao});
const activePaymentStates=["pendente","pago","cancelamento_pendente","estorno_pendente","conciliacao"];

// Confirma a associação entre usuário e cliente cadastrado no provedor.
async function ownedCustomer(userId:string):Promise<string> {
 const current=await prisma.usuarios.findUniqueOrThrow({where:{id:userId}});
 if(current.mercado_pago_customer_id){await new MercadoPagoGateway().verifyCustomer(current.mercado_pago_customer_id,current);return current.mercado_pago_customer_id;}
 // Intenção persistida e lease impedem criar dois clientes no provedor para o mesmo usuário.
 const key=`customer:${userId}`,fingerprint=operationFingerprint({tipo:"customer_criar",usuario_id:userId,versao:1});
 await prisma.operacoes_gateway.createMany({data:[{chave:key,tipo:"customer_criar",usuario_id:userId,fingerprint}],skipDuplicates:true});
 let operation=await prisma.operacoes_gateway.findUniqueOrThrow({where:{chave:key}});
 if(operation.fingerprint!==fingerprint)throw new HttpError(409,"Operação de customer incompatível","idempotencia_conflitante");
 if(operation.referencia) {
  await prisma.usuarios.updateMany({where:{id:userId,mercado_pago_customer_id:null},data:{mercado_pago_customer_id:operation.referencia}});
  return (await prisma.usuarios.findUniqueOrThrow({where:{id:userId}})).mercado_pago_customer_id!;
 }
 if(!await claimGatewayOperation(key)) {
  operation=await waitFor(()=>prisma.operacoes_gateway.findUniqueOrThrow({where:{chave:key}}),row=>Boolean(row.referencia));
  if(!operation.referencia)throw new HttpError(409,"Criação de customer em andamento","operacao_pendente");
  await prisma.usuarios.updateMany({where:{id:userId,mercado_pago_customer_id:null},data:{mercado_pago_customer_id:operation.referencia}});
  return (await prisma.usuarios.findUniqueOrThrow({where:{id:userId}})).mercado_pago_customer_id!;
 }
 try {
  const user=await prisma.usuarios.findUniqueOrThrow({where:{id:userId}});
  const customer=await new MercadoPagoGateway().customer(user);
  await prisma.operacoes_gateway.update({where:{chave:key},data:{referencia:customer,estado:"concluida",lease_ate:null}});
  await prisma.usuarios.updateMany({where:{id:userId,mercado_pago_customer_id:null},data:{mercado_pago_customer_id:customer}});
  const linked=(await prisma.usuarios.findUniqueOrThrow({where:{id:userId}})).mercado_pago_customer_id;
  if(linked!==customer)throw new HttpError(409,"Customer concorrente exige análise","customer_conflitante");
  return customer;
 } catch(error) {
  await prisma.operacoes_gateway.updateMany({where:{chave:key,estado:"processando"},data:{estado:"falhou",lease_ate:null}});
  throw error;
 }
}

// Persiste a referência do cartão do provedor vinculada ao usuário.
async function persistCard(userId:string,customer:string,gateway:string,safe:SafeCard) {
 return prisma.$transaction(async tx=>{
  await tx.$queryRaw`SELECT id FROM usuarios WHERE id=${userId}::uuid FOR UPDATE`;
  const known=await tx.cartoes.findUnique({where:{id:safe.id}});
  if(known && known.usuario_id!==userId)throw new HttpError(409,"Cartão pertence a outro usuário");
  if(known)return known;
  const count=await tx.cartoes.count({where:{usuario_id:userId}});
  return tx.cartoes.create({data:{...safe,usuario_id:userId,customer_id:customer,gateway,padrao:count===0}});
 });
}

// Lista cartões do titular sem expor número completo ou código de segurança.
export const listCards:RequestHandler=async(req,res)=>{res.json((await prisma.cartoes.findMany({where:{usuario_id:req.user!.id},orderBy:[{padrao:"desc"},{criado_em:"asc"}]})).map(cardDto));};

// Recebe token do provedor, verifica titularidade e cadastra cartão para cobranças futuras.
export const addCard:RequestHandler=async(req,res)=>{
 rejectCardSecrets(req.body);
 if(Object.keys(req.body ?? {}).some(key=>key!=="token_cartao"))throw new HttpError(422,"Envie somente token_cartao","dados_invalidos");
 const token=text(req.body?.token_cartao,"Token do cartão",1000),demo=simulated(),gateway=demo?"demo":"mercado_pago";
 if(!demo && token.startsWith("tok_demo_"))throw new HttpError(422,"Token de demonstração não é aceito no gateway real","token_demo_invalido");
 const customer=demo?`demo-${req.user!.id}`:await ownedCustomer(req.user!.id);
 if(demo) {const card=await persistCard(req.user!.id,customer,gateway,{id:`demo-${crypto.randomUUID()}`,bandeira:"Demo",payment_method_id:"demo",ultimos_digitos:"0000",validade:"12/99"});res.status(201).json(cardDto(card));return;}
 const tokenDigest=crypto.createHash("sha256").update(token).digest("hex");
 // Usa hash do token como chave da operação; nunca grava o token bruto no banco.
 const key=`card:add:${req.user!.id}:${tokenDigest}`,fingerprint=operationFingerprint({tipo:"cartao_adicionar",usuario_id:req.user!.id,customer,token_digest:tokenDigest,versao:1});
 await prisma.operacoes_gateway.createMany({data:[{chave:key,tipo:"cartao_adicionar",usuario_id:req.user!.id,fingerprint,dados:{customer_id:customer}}],skipDuplicates:true});
 let operation=await prisma.operacoes_gateway.findUniqueOrThrow({where:{chave:key}});
 if(operation.fingerprint!==fingerprint)throw new HttpError(409,"Operação de cartão incompatível","idempotencia_conflitante");
 if(operation.estado==="conciliacao" && !operation.referencia)throw new HttpError(409,"Inclusão remota do cartão exige conciliação","conciliacao_pendente");
 let safe:SafeCard|undefined;
 if(operation.referencia && operation.dados) safe=operation.dados as SafeCard;
 if(!safe) {
  if(!await claimGatewayOperation(key)) {
   operation=await waitFor(()=>prisma.operacoes_gateway.findUniqueOrThrow({where:{chave:key}}),row=>Boolean(row.referencia));
   if(!operation.referencia)throw new HttpError(409,"Inclusão de cartão em andamento","operacao_pendente");
   safe=operation.dados as SafeCard;
  } else {
   try {
    safe=await new MercadoPagoGateway().addCard(customer,token,key);
    await prisma.operacoes_gateway.update({where:{chave:key},data:{referencia:safe.id,dados:safe,lease_ate:null}});
   } catch(error) {
    await prisma.operacoes_gateway.updateMany({where:{chave:key,estado:"processando"},data:{estado:error instanceof HttpError && error.status===502?"conciliacao":"falhou",lease_ate:null}});
    throw error;
   }
  }
 }
 // Só grava o cartão local após receber os dados seguros do provedor.
 const card=await persistCard(req.user!.id,customer,gateway,safe);
 await prisma.operacoes_gateway.update({where:{chave:key},data:{estado:"concluida",lease_ate:null}});
 res.status(201).json(cardDto(card));
};

// Define o cartão padrão somente entre os cartões do usuário.
export const defaultCard:RequestHandler=async(req,res)=>{
 const id=text(req.params.id,"Cartão",200);
 const card=await prisma.$transaction(async tx=>{
  await tx.$queryRaw`SELECT id FROM usuarios WHERE id=${req.user!.id}::uuid FOR UPDATE`;
  const current=await tx.cartoes.findFirst({where:{id,usuario_id:req.user!.id}});
  if(!current)throw new HttpError(404,"Cartão não encontrado.","nao_encontrada");
  await tx.cartoes.updateMany({where:{usuario_id:req.user!.id,padrao:true},data:{padrao:false}});
  return tx.cartoes.update({where:{id},data:{padrao:true}});
 });res.json(cardDto(card));
};

// Impede exclusão de cartão associado a cobrança ainda ativa.
async function cardInUse(id:string):Promise<boolean> {
 return Boolean(await prisma.pagamentos.count({where:{cartao_id:id,status:{in:activePaymentStates},alugueis:{status:{in:["aprovado","pago","retirado","devolvido"]}}}}));
}

// Marca intenção de exclusão para evitar operações concorrentes no cartão.
async function reserveCardDeletion(userId:string,id:string):Promise<void> {
 await prisma.$transaction(async tx=>{
  await tx.$queryRaw`SELECT id FROM usuarios WHERE id=${userId}::uuid FOR UPDATE`;
  const card=await tx.cartoes.findFirst({where:{id,usuario_id:userId}});
  if(!card)return;
  if(await tx.pagamentos.count({where:{cartao_id:id,status:{in:activePaymentStates},alugueis:{status:{in:["aprovado","pago","retirado","devolvido"]}}}}))throw new HttpError(409,"O cartão está vinculado a uma locação em andamento.","cartao_em_uso");
  await tx.cartoes.update({where:{id},data:{exclusao_pendente:true}});
 });
}

// Remove o vínculo local depois de resolver a exclusão no provedor.
async function removeLocalCard(userId:string,id:string):Promise<void> {
 await prisma.$transaction(async tx=>{
  await tx.$queryRaw`SELECT id FROM usuarios WHERE id=${userId}::uuid FOR UPDATE`;
  const card=await tx.cartoes.findFirst({where:{id,usuario_id:userId}});
  if(!card)return;
  if(await tx.pagamentos.count({where:{cartao_id:id,status:{in:activePaymentStates},alugueis:{status:{in:["aprovado","pago","retirado","devolvido"]}}}}))throw new HttpError(409,"O cartão está vinculado a uma locação em andamento.","cartao_em_uso");
  const replacement=await tx.cartoes.findFirst({where:{usuario_id:userId,id:{not:id}},orderBy:{criado_em:"asc"}});
  await tx.cartoes.delete({where:{id}});
  if(card.padrao && replacement)await tx.cartoes.update({where:{id:replacement.id},data:{padrao:true}});
 });
}

// Solicita exclusão do cartão no provedor e conclui o estado local.
export const deleteCard:RequestHandler=async(req,res)=>{
 const id=text(req.params.id,"Cartão",200);
 const card=await prisma.cartoes.findFirst({where:{id,usuario_id:req.user!.id}});
 if(!card)throw new HttpError(404,"Cartão não encontrado.","nao_encontrada");
 if(await cardInUse(id))throw new HttpError(409,"O cartão está vinculado a uma locação em andamento.","cartao_em_uso");
 if(!["demo","mercado_pago"].includes(card.gateway))throw new HttpError(409,"Gateway do cartão requer análise");
 const key=`card:delete:${req.user!.id}:${id}`,fingerprint=operationFingerprint({tipo:"cartao_excluir",usuario_id:req.user!.id,customer:card.customer_id,cartao_id:id,gateway:card.gateway,versao:1});
 await prisma.operacoes_gateway.createMany({data:[{chave:key,tipo:"cartao_excluir",usuario_id:req.user!.id,fingerprint,referencia:id,dados:{customer_id:card.customer_id,gateway:card.gateway}}],skipDuplicates:true});
 const operation=await prisma.operacoes_gateway.findUniqueOrThrow({where:{chave:key}});
 if(operation.fingerprint!==fingerprint)throw new HttpError(409,"Operação de cartão incompatível","idempotencia_conflitante");
 if(operation.estado!=="concluida") {
  if(await claimGatewayOperation(key)) {
   try {
    await reserveCardDeletion(req.user!.id,id);
    if(card.gateway==="mercado_pago")await new MercadoPagoGateway().removeCard(card.customer_id,id);
    await removeLocalCard(req.user!.id,id);
    await prisma.operacoes_gateway.update({where:{chave:key},data:{estado:"concluida",lease_ate:null}});
   } catch(error) {
    await prisma.operacoes_gateway.updateMany({where:{chave:key,estado:"processando"},data:{estado:"falhou",lease_ate:null}});
    throw error;
   }
  } else {
   const completed=await waitFor(()=>prisma.operacoes_gateway.findUniqueOrThrow({where:{chave:key}}),row=>row.estado==="concluida");
   if(completed.estado!=="concluida")throw new HttpError(409,"Exclusão de cartão em andamento","operacao_pendente");
  }
 } else await removeLocalCard(req.user!.id,id);
 res.status(204).end();
};

// Job que retoma exclusões pendentes de cartões após falhas transitórias.
export async function reconcileCardOperations():Promise<void> {
 const now=new Date();
 const rows=await prisma.operacoes_gateway.findMany({where:{tipo:"cartao_excluir",OR:[{estado:{in:["pendente","falhou"]}},{estado:"processando",lease_ate:{lt:now}}],AND:[{OR:[{proxima_tentativa_em:null},{proxima_tentativa_em:{lte:now}}]}]},take:FINANCIAL_BATCH_SIZE,orderBy:[{tentativas:"asc"},{proxima_tentativa_em:"asc"},{criado_em:"asc"}]});
 for(const operation of rows) {
  if(!operation.usuario_id || !operation.referencia || !await claimGatewayOperation(operation.chave))continue;
  await prisma.operacoes_gateway.update({where:{chave:operation.chave},data:{proxima_tentativa_em:nextRetry(operation.tentativas+1,now)}});
  const data=operation.dados as {customer_id?:string;gateway?:string};
  try {
   await reserveCardDeletion(operation.usuario_id,operation.referencia);
   if(data.gateway==="mercado_pago" && data.customer_id)await new MercadoPagoGateway().removeCard(data.customer_id,operation.referencia);
   await removeLocalCard(operation.usuario_id,operation.referencia);
   await prisma.operacoes_gateway.update({where:{chave:operation.chave},data:{estado:"concluida",lease_ate:null}});
  } catch {
   await prisma.operacoes_gateway.updateMany({where:{chave:operation.chave,estado:"processando"},data:{estado:"falhou",lease_ate:null}});
  }
 }
}
