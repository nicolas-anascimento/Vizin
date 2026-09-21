// Fixa regras de preço, prazo no fuso São Paulo, multa, idempotência e autenticação do webhook.
import assert from "node:assert/strict";
import test from "node:test";
import crypto from "node:crypto";
import { spawnSync } from "node:child_process";
import { assertPayable,contractedPrice,rentalPrice,paymentDeadline,rentalDayEnd,finePrice,rejectCardSecrets } from "../app/services/paymentRules.ts";
import { verifyMercadoPagoSignature } from "../app/services/mercadoPagoGateway.ts";
import { operationFingerprint } from "../app/services/gatewayOperations.ts";
import { serializePublicPayment } from "../app/utils/serializers.ts";
import { businessDate, businessLateDays } from "../app/utils/dates.ts";
import { nextRetry } from "../app/services/retryQueue.ts";

// Protege o cálculo contra a interpretação de taxa por dia de aluguel.
test("taxa é 10% de uma diária, não do subtotal",()=>{assert.deepEqual(rentalPrice(35,3),{preco_dia:35,subtotal:105,taxa_servico:3.5,total:108.5,dias:3});assert.equal(rentalPrice(35,30).taxa_servico,3.5);});
test("valores monetários calculados em centavos",()=>{assert.equal(rentalPrice(0.15,3).total,0.47);assert.throws(()=>rentalPrice(-1,3));});
test("preço contratado preserva solicitação, inclusive legado",()=>{const r={data_inicio:new Date("2026-10-01"),data_fim:new Date("2026-10-04"),valor_total:105};assert.equal(contractedPrice(r).preco_dia,35);assert.equal(contractedPrice({...r,preco_dia_contratado:40}).total,124);});
// Usa instantes UTC explícitos para provar o corte na meia-noite local.
test("fim do dia de retirada usa America/Sao_Paulo",()=>{const start=new Date("2026-10-01T00:00:00.000Z");assert.equal(rentalDayEnd(start).toISOString(),"2026-10-02T03:00:00.000Z");assert.equal(paymentDeadline({data_inicio:start,pagamento_ate:new Date("2026-10-03T00:00:00.000Z")}).toISOString(),"2026-10-02T03:00:00.000Z");});
test("prazo brasileiro não vence às 21h e muda no fim do dia civil",()=>{const end=rentalDayEnd(new Date("2026-10-01T00:00:00.000Z"));assert.ok(new Date("2026-10-02T00:30:00.000Z")<end);assert.ok(new Date("2026-10-02T03:01:00.000Z")>end);});
test("prazo termina somente no fim do dia da retirada mesmo após mais de 24h da aprovação",()=>{const start=new Date("2026-10-10T00:00:00.000Z"),end=new Date("2026-10-11T03:00:00.000Z");for(const oldLimit of [new Date("2026-10-09T15:00:00.000Z"),new Date("2026-10-10T20:00:00.000Z"),new Date("2026-10-12T15:00:00.000Z")])assert.equal(paymentDeadline({data_inicio:start,pagamento_ate:oldLimit}).toISOString(),end.toISOString());assert.equal(end.getTime()-1,new Date("2026-10-10T23:59:59.999-03:00").getTime());});
test("prazo aceita antes do corte e expira exatamente à meia-noite local",()=>{const r={status:"aprovado",locatario_id:"u",data_inicio:new Date("2026-09-20T00:00:00.000Z"),itens:{disponivel:true,arquivado:false,usuarios:{ativo:true}}};assert.doesNotThrow(()=>assertPayable(r,"u",new Date("2026-09-21T02:59:59.999Z")));for(const instant of ["2026-09-21T03:00:00.000Z","2026-09-21T03:00:00.001Z"])assert.throws(()=>assertPayable(r,"u",new Date(instant)),(e:any)=>e.codigo==="prazo_expirado");});
test("cancelamento tem prioridade sobre prazo vencido",()=>{assert.throws(()=>assertPayable({status:"cancelado",locatario_id:"u",data_inicio:new Date("2020-01-01"),pagamento_ate:new Date("2020-01-01"),itens:{}},"u"),(error:any)=>error.codigo==="cancelada");});
// Garante valor padrão e erro controlado quando a configuração desabilita cobrança.
test("multa usa diária aprovada de R$ 2 e configuração inválida falha de forma controlada",()=>{const old=process.env.MULTA_VALOR_DIA;delete process.env.MULTA_VALOR_DIA;try{assert.equal(finePrice({status:"retirado",data_fim:new Date("2026-10-01")},new Date("2026-10-03T12:00:00Z")).valor_total,4);process.env.MULTA_VALOR_DIA="";assert.throws(()=>finePrice({status:"retirado",data_fim:new Date("2026-10-01")},new Date("2026-10-03T12:00:00Z")),(e:any)=>e.codigo==="multa_desabilitada");}finally{if(old!==undefined)process.env.MULTA_VALOR_DIA=old;else delete process.env.MULTA_VALOR_DIA;}});
test("dia civil de aluguel, retirada e manutenção segue São Paulo às 00:30 UTC",()=>{
 const instant=new Date("2026-09-20T00:30:00.000Z");
 assert.equal(businessDate(instant).toISOString(),"2026-09-19T00:00:00.000Z");
 assert.equal(businessLateDays(new Date("2026-09-19"),instant),0);
 assert.equal(businessLateDays(new Date("2026-09-19"),new Date("2026-09-20T03:00:00.000Z")),1);
});
test("multa começa somente à meia-noite de São Paulo",()=>{
 const old=process.env.MULTA_VALOR_DIA;process.env.MULTA_VALOR_DIA="10";
 const rental={status:"retirado",data_fim:new Date("2026-09-19"),devolucoes:[]};
 try{assert.throws(()=>finePrice(rental,new Date("2026-09-20T02:59:59.999Z")),(e:any)=>e.codigo==="sem_multa");assert.equal(finePrice(rental,new Date("2026-09-20T03:00:00.000Z")).valor_total,10);}finally{if(old===undefined)delete process.env.MULTA_VALOR_DIA;else process.env.MULTA_VALOR_DIA=old;}
});
test("retry financeiro aumenta atraso e permite novos lotes",()=>{const now=new Date("2026-01-01T00:00:00Z");assert.equal(nextRetry(1,now).getTime()-now.getTime(),1000);assert.equal(nextRetry(2,now).getTime()-now.getTime(),2000);assert.equal(nextRetry(20,now).getTime()-now.getTime(),3600000);});
test("dados sensíveis de cartão são rejeitados inclusive campos aninhados",()=>{for(const field of ["PAN","CVV","card_number","security_code"])assert.throws(()=>rejectCardSecrets({card:{[field]:"secret"}}));rejectCardSecrets({token_cartao:"token",cartao_id:"id"});});
test("fingerprint é canônico e distingue operações",()=>{assert.equal(operationFingerprint({a:1,b:{y:2,x:3}}),operationFingerprint({b:{x:3,y:2},a:1}));assert.notEqual(operationFingerprint({cartao_id:"a"}),operationFingerprint({cartao_id:"b"}));});
test("assinatura MP aceita recente e rejeita antiga, futura e inválida",()=>{const old=process.env.MP_WEBHOOK_SECRET;process.env.MP_WEBHOOK_SECRET="test-secret";try{const sign=(ts:string,request="req-123")=>crypto.createHmac("sha256","test-secret").update(`id:123;request-id:${request};ts:${ts};`).digest("hex"),now=String(Math.floor(Date.now()/1000));assert.equal(verifyMercadoPagoSignature("123",`ts=${now},v1=${sign(now)}`,"req-123").resourceId,"123");for(const ts of [String(Math.floor(Date.now()/1000)-301),String(Math.floor(Date.now()/1000)+301)])assert.throws(()=>verifyMercadoPagoSignature("123",`ts=${ts},v1=${sign(ts)}`,"req-123"));assert.throws(()=>verifyMercadoPagoSignature("124",`ts=${now},v1=${sign(now)}`,"req-123"));assert.throws(()=>verifyMercadoPagoSignature("123",`ts=${now},ts=999,v1=${sign(now)}`,"req-123"));}finally{if(old===undefined)delete process.env.MP_WEBHOOK_SECRET;else process.env.MP_WEBHOOK_SECRET=old;}});
test("status financeiro desconhecido falha de forma controlada",()=>{for(const [internal,expected]of Object.entries({pago:"aprovado",falhou:"recusado",estornado:"cancelado",cancelado:"cancelado",estorno_pendente:"pendente",cancelamento_pendente:"pendente",pendente:"pendente"}))assert.equal(serializePublicPayment({id:"uuid",status:internal,dados:{},valor:108.5}).status,expected);assert.throws(()=>serializePublicPayment({id:"uuid",status:"conciliacao",dados:{},valor:108.5}),(error:any)=>error.codigo==="conciliacao_pendente");assert.throws(()=>serializePublicPayment({id:"uuid",status:"legado_desconhecido",dados:{},valor:108.5}),(error:any)=>error.codigo==="estado_financeiro_desconhecido");});
for(const script of ["test:integration","test:financial"])test(`${script} exige banco configurado e não dá verde com zero testes`,()=>{const result=spawnSync("npm",["run",script],{cwd:process.cwd(),env:{...process.env,TEST_DATABASE_URL:""},encoding:"utf8",timeout:15000});assert.notEqual(result.status,0,`${script} terminou com sucesso sem banco`);assert.match(result.stderr, new RegExp(`TEST_DATABASE_URL é obrigatório para ${script}`));});
