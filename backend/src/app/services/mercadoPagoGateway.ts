import crypto from "node:crypto";
import { HttpError } from "../utils/httpError.ts";
import type { GatewayResult } from "./paymentGateway.ts";
// Interface de operações externas consumida pelos fluxos de pagamento.
export interface PaymentGateway {
 request(operation:string,data:Record<string,unknown>,key:string):Promise<GatewayResult>;
 payment(reference:string):Promise<GatewayResult>;
}
export type SafeCard = {id:string;bandeira:string;ultimos_digitos:string;validade:string;payment_method_id:string};
// Restringe IDs recebidos do provedor antes de usá-los em URLs ou consultas.
export function providerId(value:unknown):string {
 const id=typeof value==="number" && Number.isSafeInteger(value) ? String(value) : value;
 if(typeof id!=="string" || !/^[a-zA-Z0-9_-]{1,200}$/.test(id))throw new HttpError(502,"Referência inválida do Mercado Pago");
 return id;
}
// Traduz estados do Mercado Pago para os estados financeiros internos.
export function mpStatus(status:unknown):GatewayResult["status"] {
 if(status==="approved")return "pago";
 if(status==="rejected")return "falhou";
 if(status==="cancelled")return "cancelado";
 if(status==="refunded")return "estornado";
 if(["pending","in_process","authorized","in_mediation"].includes(String(status)))return "pendente";
 throw new HttpError(502,"Estado do Mercado Pago requer análise");
}
// Adaptador HTTP do Mercado Pago: autenticação, idempotência, cobranças, clientes e cartões.
export class MercadoPagoGateway implements PaymentGateway {
 // Centraliza chamada HTTPS, timeout e erros sem registrar dados sensíveis do provedor.
 private async http(method:string,path:string,body?:unknown,key?:string,device?:unknown):Promise<any> {
  const token=process.env.MP_ACCESS_TOKEN?.trim();
  if(!token)throw new HttpError(503,"Mercado Pago não configurado");
  const headers:Record<string,string>={Authorization:`Bearer ${token}`,"Content-Type":"application/json"};
  if(key)headers["X-Idempotency-Key"]=crypto.createHash("sha256").update(key).digest("hex");
  if(typeof device==="string" && /^[\w-]{1,200}$/.test(device))headers["X-meli-session-id"]=device;
  let response:Response;
  try {response=await fetch(`https://api.mercadopago.com${path}`,{method,headers,...(body===undefined?{}:{body:JSON.stringify(body)}),signal:AbortSignal.timeout(15000)});}
  catch {throw new HttpError(502,"Mercado Pago indisponível; consulte o status antes de tentar novamente");}
  if(!response.ok) {
   // Erros não expõem dados sensíveis recebidos do provedor nem parâmetros da operação.
   if(response.status===404 && method==="DELETE")return {};
   throw new HttpError(response.status===400 || response.status===422 ? 422 : 502,"Mercado Pago não aceitou a operação", "gateway_recusou_operacao");
  }
  if(response.status===204)return {};
  try {const payload=await response.json();if(!payload || typeof payload!=="object")throw new Error();return payload;}
  catch {throw new HttpError(502,"Resposta inválida do Mercado Pago");}
 }
 // Valida o retorno e extrai PIX ou desafio 3DS para o contrato interno.
 private result(payload:any):GatewayResult {
  const reference=providerId(payload.id),status=mpStatus(payload.status);
  if(typeof payload.transaction_amount!=="number" || !Number.isFinite(payload.transaction_amount))throw new HttpError(502,"Valor inválido do Mercado Pago");
  const pix=payload.point_of_interaction?.transaction_data;
  const challenge=payload.three_ds_info;
  let action:GatewayResult["acao_necessaria"];
  if(challenge?.external_resource_url && typeof challenge.external_resource_url==="string") {
   try{const url=new URL(challenge.external_resource_url);if(url.protocol!=="https:")throw new Error();action={tipo:"3ds",url:url.toString(),...(typeof challenge.creq==="string"?{creq:challenge.creq}:{})};}catch{throw new HttpError(502,"Desafio 3DS inválido do Mercado Pago");}
  }
  return {referencia:reference,status,valor:payload.transaction_amount,moeda:payload.currency_id,external_reference:payload.external_reference,metadata:payload.metadata ?? {},
   ...(payload.card?.id?{cartao_id:providerId(payload.card.id)}:{}),
   ...(action?{acao_necessaria:action}:{}),
   ...(typeof pix?.qr_code==="string"?{codigo_copia_cola:pix.qr_code}:{}),
   ...(typeof pix?.qr_code_base64==="string"?{qr_code_base64:pix.qr_code_base64}:{}),
   ...(typeof payload.date_of_expiration==="string"?{expira_em:payload.date_of_expiration}:{})};
 }
 async payment(reference:string):Promise<GatewayResult> {return this.result(await this.http("GET",`/v1/payments/${providerId(reference)}`));}
 // Cria cobrança ou executa cancelamento/estorno; confirma identidade e valor retornados.
 async request(operation:string,data:Record<string,unknown>,key:string):Promise<GatewayResult> {
  if(operation==="payments") {
   const card=data.metodo==="cartao";
   const user=data.pagador as {id:string;email:string;cpf:string;nome:string;customer_id?:string};
   if(!user?.id || !user.email || !user.cpf)throw new HttpError(422,"Cadastro do pagador incompleto");
   const payer=card && user.customer_id ? {type:"customer",id:user.customer_id} : {email:user.email,first_name:user.nome,identification:{type:"CPF",number:user.cpf}};
   const result=this.result(await this.http("POST","/v1/payments",{
    transaction_amount:data.valor,description:`Vizin: ${data.tipo ?? "aluguel"}`,payment_method_id:card?data.payment_method_id:"pix",payer,
    external_reference:data.id,metadata:{pagamento_id:data.id,aluguel_id:data.aluguelId,usuario_id:user.id,tipo:data.tipo ?? "aluguel"},
    ...(card?{token:data.tokenCartao,installments:1,three_d_secure_mode:"optional"}: {date_of_expiration:data.expira_em}),
    ...(process.env.MP_NOTIFICATION_URL ? {notification_url:process.env.MP_NOTIFICATION_URL}:{}),
   },key,data.device_id));
   if(result.external_reference!==data.id || result.valor!==data.valor || result.moeda!=="BRL")throw new HttpError(502,"Referência ou valor do Mercado Pago divergente");
   return result;
  }
  const match=/^payments\/([\w-]+)\/(cancel|refund)$/.exec(operation);
  if(!match)throw new HttpError(500,"Operação de gateway inválida");
  const reference=match[1]!;
  const before=await this.payment(reference);
  if(before.status===(match[2]==="cancel"?"cancelado":"estornado"))return before;
  if(match[2]==="cancel")return this.result(await this.http("PUT",`/v1/payments/${reference}`,{status:"cancelled"},key));
  await this.http("POST",`/v1/payments/${reference}/refunds`,{},key);
  // Consulta o estado do pagamento; o estado do recurso de estorno não o substitui.
  return this.payment(reference);
 }
 // Busca cobrança pela referência local para recuperar criação cujo resultado não foi persistido.
 async findPayment(externalReference:string):Promise<GatewayResult|null> {
  const payload=await this.http("GET",`/v1/payments/search?external_reference=${encodeURIComponent(externalReference)}`);
  const rows=Array.isArray(payload.results)?payload.results:[];
  const exact=rows.filter((p:any)=>p.external_reference===externalReference);
  if(exact.length>1)throw new HttpError(409,"Cobranças duplicadas exigem conciliação");
  return exact.length===1?this.result(exact[0]):null;
 }
 // Reutiliza somente cliente marcado como pertencente a este usuário; email igual não prova propriedade.
 async customer(user:{id:string;email:string;nome:string;cpf:string|null}):Promise<string> {
  const search=await this.http("GET",`/v1/customers/search?email=${encodeURIComponent(user.email)}`);
  const candidates=Array.isArray(search.results)?search.results:[];
  const marker=`vizin:${user.id}`;
  const owned=candidates.filter((candidate:any)=>candidate?.email===user.email && candidate?.description===marker);
  if(owned.length>1)throw new HttpError(409,"Customer duplicado exige análise","customer_conflitante");
  if(owned.length===1)return providerId(owned[0].id);
  // Email igual não prova titularidade: clientes sem marcador da Vizin são ignorados,
  // e um cliente próprio é criado com identificação do usuário.
  const created=await this.http("POST","/v1/customers",{email:user.email,first_name:user.nome,description:`vizin:${user.id}`,identification:{type:"CPF",number:user.cpf}},`customer:${user.id}`);
  return providerId(created.id);
 }
 // Confirma no provedor que um cartão salvo pertence ao cliente associado ao usuário.
 async verifyCustomer(customerId:string,user:{id:string;email:string}):Promise<void> {
  const customer=await this.http("GET",`/v1/customers/${providerId(customerId)}`);
  if(providerId(customer.id)!==customerId || customer.description!==`vizin:${user.id}` || customer.email!==user.email)
   throw new HttpError(409,"Customer associado exige conciliação de propriedade","customer_conflitante");
 }
 // Mantém apenas dados não sensíveis do cartão: bandeira, final e validade.
 private safeCard(card:any):SafeCard {
  const id=providerId(card.id),last=card.last_four_digits;
  const month=Number(card.expiration_month),year=Number(card.expiration_year);
  if(typeof last!=="string" || !/^\d{4}$/.test(last) || !Number.isInteger(month) || month<1 || month>12 || !Number.isInteger(year) || year<2000 || year>2199)throw new HttpError(502,"Cartão inválido do Mercado Pago");
  const method=String(card.payment_method?.id ?? "cartao");
  return {id,ultimos_digitos:last,validade:`${String(month).padStart(2,"0")}/${String(year).slice(-2)}`,payment_method_id:method,bandeira:({visa:"Visa",master:"Mastercard",amex:"Amex",elo:"Elo"} as Record<string,string>)[method] ?? method};
 }
 async addCard(customer:string,token:string,key:string):Promise<SafeCard> {return this.safeCard(await this.http("POST",`/v1/customers/${providerId(customer)}/cards`,{token},key));}
 async removeCard(customer:string,card:string):Promise<void> {await this.http("DELETE",`/v1/customers/${providerId(customer)}/cards/${providerId(card)}`,undefined,`delete-card:${card}`);}
}
// Valida assinatura, janela de tempo e ID do recurso de um webhook do Mercado Pago.
export function verifyMercadoPagoSignature(dataId:unknown,signature:unknown,requestId:unknown):{resourceId:string;requestId:string} {
 const secret=process.env.MP_WEBHOOK_SECRET;
 if(!secret || typeof signature!=="string" || typeof requestId!=="string" || !/^[\w-]{1,200}$/.test(requestId))throw new HttpError(401,"Webhook não autenticado");
 const parts=signature.split(",").map(p=>p.trim().split("="));
 if(parts.filter(p=>p[0]==="ts").length!==1 || parts.filter(p=>p[0]==="v1").length!==1)throw new HttpError(401,"Assinatura inválida");
 const ts=parts.find(p=>p[0]==="ts")?.[1],hash=parts.find(p=>p[0]==="v1")?.[1];
 if(!ts || !/^\d{1,20}$/.test(ts) || !hash || !/^[a-f0-9]{64}$/i.test(hash))throw new HttpError(401,"Assinatura inválida");
 let resourceId:string;try{resourceId=providerId(dataId);}catch{throw new HttpError(401,"Identificador de webhook inválido");}
 const timestamp=Number(ts);
 const now=Math.floor(Date.now()/1000),tolerance=300;
 if(!Number.isSafeInteger(timestamp) || Math.abs(now-timestamp)>tolerance)throw new HttpError(401,"Assinatura expirada");
 const manifest=`id:${resourceId.toLowerCase()};request-id:${requestId};ts:${ts};`;
 const expected=crypto.createHmac("sha256",secret).update(manifest).digest();
 if(!crypto.timingSafeEqual(expected,Buffer.from(hash,"hex")))throw new HttpError(401,"Assinatura inválida");
 return {resourceId,requestId};
}
