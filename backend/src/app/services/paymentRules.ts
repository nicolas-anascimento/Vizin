import { BUSINESS_TIME_ZONE, businessDayStart, businessLateDays, rentalDays } from "../utils/dates.ts";
import { HttpError } from "../utils/httpError.ts";
// Valores monetários são calculados em centavos para evitar erros de precisão de ponto flutuante.
export const cents = (value: number): number => Math.round((value + Number.EPSILON) * 100);
export const PAYMENT_TIME_ZONE = BUSINESS_TIME_ZONE;
// Calcula subtotal e taxa de serviço de 10% sobre a diária; valida limites antes de persistir o contrato.
export function rentalPrice(daily: number, days: number) {
 const rate = cents(daily);
 if (!Number.isSafeInteger(rate) || rate <= 0 || !Number.isInteger(days) || days < 1) throw new HttpError(422,"Valor inválido");
 const subtotal = rate * days;
 const fee = Math.round(rate * 0.1);
 if (subtotal + fee > 9999999999) throw new HttpError(422,"Valor total excede o limite");
 return { preco_dia: rate / 100, subtotal: subtotal / 100, taxa_servico: fee / 100, total: (subtotal + fee) / 100, dias: days };
}
// Reconstrói o preço contratado sem depender do anúncio, que pode ter sido alterado depois.
export function contractedPrice(r: {data_inicio:Date;data_fim:Date;preco_dia_contratado?:unknown;valor_total:unknown}) {
 const days = rentalDays(r.data_inicio,r.data_fim);
 // Em registros legados, valor_total guarda o subtotal contratado, não o preço atual do anúncio.
 return rentalPrice(r.preco_dia_contratado == null ? Number(r.valor_total)/days : Number(r.preco_dia_contratado),days);
}
// Converte o dia seguinte à retirada em instante de meia-noite no fuso comercial.
export function rentalDayEnd(rentalDate:Date):Date {
 const next=new Date(Date.UTC(rentalDate.getUTCFullYear(),rentalDate.getUTCMonth(),rentalDate.getUTCDate()+1));
 return businessDayStart(next);
}
// Usa o limite temporal da retirada para expirar cobranças aprovadas sem pagamento.
export function paymentDeadline(r:{data_inicio:Date;pagamento_ate?:Date|null}):Date {
 return rentalDayEnd(r.data_inicio);
}
// Verifica titularidade, aprovação, prazo e disponibilidade antes de abrir uma cobrança.
export function assertPayable(r:any,userId:string,now=new Date()):void {
 if(!r)throw new HttpError(404,"Solicitação não encontrada.","nao_encontrada");
 if(r.locatario_id!==userId)throw new HttpError(403,"A solicitação não pertence a você.","nao_pertence");
 if(r.status==="cancelado")throw new HttpError(409,"A solicitação foi cancelada.","cancelada");
 if(["pago","retirado","devolvido","finalizado"].includes(r.status))throw new HttpError(409,"A solicitação já foi paga.","ja_paga");
 if(r.status!=="aprovado")throw new HttpError(409,"A solicitação não está aprovada.","nao_aprovada");
 if(paymentDeadline(r)<=now)throw new HttpError(409,"O prazo expirou.","prazo_expirado");
 if(!r.itens || r.itens.arquivado || !r.itens.disponivel || !r.itens.usuarios?.ativo)throw new HttpError(409,"O objeto está indisponível.","objeto_indisponivel");
}
/*
 * Usa multa persistida quando já existe: esse valor permanece congelado após a devolução.
 * Caso contrário, calcula dias de atraso no fuso comercial e divide o total em
 * 10% para a plataforma e 90% para o proprietário, com arredondamento em centavos.
 */
export function finePrice(r:any,now=new Date()) {
 if(r.multa) return {status:r.multa.status,dias_atraso:r.multa.dias_atraso,valor_dia:Number(r.multa.valor_dia),valor_total:Number(r.multa.valor_total),valor_plataforma:Number(r.multa.valor_plataforma),valor_proprietario:Number(r.multa.valor_proprietario),calculado_em:r.multa.calculado_em};
 if(!["retirado","devolvido","finalizado"].includes(r.status))throw new HttpError(409,"Não há multa de devolução.","sem_multa");
 const returned=r.devolucoes?.length && ["devolvido","finalizado"].includes(r.status) ? new Date(Math.max(...r.devolucoes.map((d:any)=>new Date(d.criado_em).getTime()))) : now;
 const lateDays=businessLateDays(r.data_fim,returned);
 if(!lateDays)throw new HttpError(409,"Não há multa de devolução.","sem_multa");
 const configured=process.env.MULTA_VALOR_DIA;
 const daily=Number(configured===undefined?"2":configured);
 if(!Number.isFinite(daily) || daily<=0)throw new HttpError(503,"Multa desabilitada por configuração.","multa_desabilitada");
 const total=cents(daily)*lateDays;
 if(total>9999999999)throw new HttpError(422,"Multa excede o limite");
 const platform=Math.round(total*0.1);
 return {status:"pendente",dias_atraso:lateDays,valor_dia:cents(daily)/100,valor_total:total/100,valor_plataforma:platform/100,valor_proprietario:(total-platform)/100};
}
// Rejeita dados sensíveis de cartão em qualquer nível do corpo; a API aceita apenas token do provedor.
export function rejectCardSecrets(body:unknown):void {
 if(!body || typeof body!=="object")return;
 for(const [key,value]of Object.entries(body)) {
  if(/^(pan|cvv|cvc|security_code|securityCode|card_number|cardNumber|numero_cartao|numeroCartao|numero_completo|numero|number)$/i.test(key))throw new HttpError(422,"Envie apenas o token gerado pelo Mercado Pago; dados de cartão não são aceitos.","dados_cartao_proibidos");
  if(value && typeof value==="object")rejectCardSecrets(value);
 }
}

// Distingue um PIX ainda pendente no banco cujo prazo de uso já terminou.
export function isExpiredPix(p:{metodo:string|null;status:string|null;dados:unknown}):boolean {
 const data=p.dados as Record<string,unknown>;
 return p.metodo==="pix" && p.status==="pendente" && typeof data?.expira_em==="string" && new Date(data.expira_em)<=new Date();
}
