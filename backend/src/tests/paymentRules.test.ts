// Fixa regras de preço, prazo no fuso São Paulo, multa, idempotência e autenticação do webhook.
import assert from "node:assert/strict";
import test from "node:test";
import crypto from "node:crypto";
import { spawnSync } from "node:child_process";
import { contractedPrice,rentalPrice,paymentDeadline,rentalDayEnd,rejectCardSecrets } from "../app/services/paymentRules.ts";
import { verifyMercadoPagoSignature } from "../app/services/mercadoPagoGateway.ts";
import { operationFingerprint } from "../app/services/gatewayOperations.ts";
import { serializePublicPayment } from "../app/utils/serializers.ts";
import { businessDate, businessLateDays, withdrawalWindowCode } from "../app/utils/dates.ts";
import { nextRetry } from "../app/services/retryQueue.ts";
import { addUtcMonth, freePeriod } from "../app/services/subscriptionService.ts";

// Protege o cálculo contra a interpretação de taxa por dia de aluguel.
test("aluguel é referência e não inclui taxa da plataforma",()=>{assert.deepEqual(rentalPrice(35,3),{preco_dia:35,subtotal:105,taxa_servico:0,total:105,dias:3});assert.equal(rentalPrice(35,30).taxa_servico,0);});
test("valores de referência são calculados em centavos",()=>{assert.equal(rentalPrice(0.15,3).total,0.45);assert.throws(()=>rentalPrice(-1,3));});
test("preço contratado preserva solicitação sem comissão",()=>{const r={data_inicio:new Date("2026-10-01"),data_fim:new Date("2026-10-04"),valor_total:105};assert.equal(contractedPrice(r).preco_dia,35);assert.equal(contractedPrice({...r,preco_dia_contratado:40}).total,120);});
// Usa instantes UTC explícitos para provar o corte na meia-noite local.
test("fim do dia de retirada usa America/Sao_Paulo",()=>{const start=new Date("2026-10-01T00:00:00.000Z");assert.equal(rentalDayEnd(start).toISOString(),"2026-10-02T03:00:00.000Z");assert.equal(paymentDeadline({data_inicio:start,pagamento_ate:new Date("2026-10-03T00:00:00.000Z")}).toISOString(),"2026-10-02T03:00:00.000Z");});
test("prazo brasileiro não vence às 21h e muda no fim do dia civil",()=>{const end=rentalDayEnd(new Date("2026-10-01T00:00:00.000Z"));assert.ok(new Date("2026-10-02T00:30:00.000Z")<end);assert.ok(new Date("2026-10-02T03:01:00.000Z")>end);});
test("prazo termina somente no fim do dia da retirada mesmo após mais de 24h da aprovação",()=>{const start=new Date("2026-10-10T00:00:00.000Z"),end=new Date("2026-10-11T03:00:00.000Z");for(const oldLimit of [new Date("2026-10-09T15:00:00.000Z"),new Date("2026-10-10T20:00:00.000Z"),new Date("2026-10-12T15:00:00.000Z")])assert.equal(paymentDeadline({data_inicio:start,pagamento_ate:oldLimit}).toISOString(),end.toISOString());assert.equal(end.getTime()-1,new Date("2026-10-10T23:59:59.999-03:00").getTime());});
test("período gratuito usa mês civil UTC",()=>{assert.deepEqual(freePeriod(new Date("2026-11-20T12:00:00Z")),{inicio:new Date("2026-11-01T00:00:00Z"),fim:new Date("2026-12-01T00:00:00Z")});});
test("período pago mensal limita o fim do mês sem perder a hora da aprovação",()=>{assert.equal(addUtcMonth(new Date("2026-01-31T13:47:22.123Z")).toISOString(),"2026-02-28T13:47:22.123Z");assert.equal(addUtcMonth(new Date("2028-01-31T00:00:00Z")).toISOString(),"2028-02-29T00:00:00.000Z");});
test("dia civil de aluguel, retirada e manutenção segue São Paulo às 00:30 UTC",()=>{
 const instant=new Date("2026-09-20T00:30:00.000Z");
 assert.equal(businessDate(instant).toISOString(),"2026-09-19T00:00:00.000Z");
 assert.equal(businessLateDays(new Date("2026-09-19"),instant),0);
 assert.equal(businessLateDays(new Date("2026-09-19"),new Date("2026-09-20T03:00:00.000Z")),1);
});
test("retirada abre somente no dia civil de São Paulo",()=>{const day=new Date("2026-10-10T00:00:00.000Z");assert.equal(withdrawalWindowCode(day,new Date("2026-10-10T02:59:59.999Z")),"retirada_data_futura");assert.equal(withdrawalWindowCode(day,new Date("2026-10-10T03:00:00.000Z")),null);assert.equal(withdrawalWindowCode(day,new Date("2026-10-11T02:59:59.999Z")),null);assert.equal(withdrawalWindowCode(day,new Date("2026-10-11T03:00:00.000Z")),"retirada_prazo_expirado");});
test("retry financeiro aumenta atraso e permite novos lotes",()=>{const now=new Date("2026-01-01T00:00:00Z");assert.equal(nextRetry(1,now).getTime()-now.getTime(),1000);assert.equal(nextRetry(2,now).getTime()-now.getTime(),2000);assert.equal(nextRetry(20,now).getTime()-now.getTime(),3600000);});
test("dados sensíveis de cartão são rejeitados inclusive campos aninhados",()=>{for(const field of ["PAN","CVV","card_number","security_code"])assert.throws(()=>rejectCardSecrets({card:{[field]:"secret"}}));rejectCardSecrets({token_cartao:"token",cartao_id:"id"});});
test("fingerprint é canônico e distingue operações",()=>{assert.equal(operationFingerprint({a:1,b:{y:2,x:3}}),operationFingerprint({b:{x:3,y:2},a:1}));assert.notEqual(operationFingerprint({cartao_id:"a"}),operationFingerprint({cartao_id:"b"}));});
test("assinatura MP aceita timestamp recente em segundos ou milissegundos e rejeita inválidos",()=>{const old=process.env.MP_WEBHOOK_SECRET;process.env.MP_WEBHOOK_SECRET="test-secret";try{const sign=(ts:string,request="req-123")=>crypto.createHmac("sha256","test-secret").update(`id:123;request-id:${request};ts:${ts};`).digest("hex"),now=String(Math.floor(Date.now()/1000)),nowMs=String(Date.now());for(const ts of [now,nowMs])assert.equal(verifyMercadoPagoSignature("123",`ts=${ts},v1=${sign(ts)}`,"req-123").resourceId,"123");for(const ts of [String(Math.floor(Date.now()/1000)-301),String(Math.floor(Date.now()/1000)+301)])assert.throws(()=>verifyMercadoPagoSignature("123",`ts=${ts},v1=${sign(ts)}`,"req-123"));assert.throws(()=>verifyMercadoPagoSignature("124",`ts=${now},v1=${sign(now)}`,"req-123"));assert.throws(()=>verifyMercadoPagoSignature("123",`ts=${now},ts=999,v1=${sign(now)}`,"req-123"));}finally{if(old===undefined)delete process.env.MP_WEBHOOK_SECRET;else process.env.MP_WEBHOOK_SECRET=old;}});
test("status financeiro desconhecido falha de forma controlada",()=>{for(const [internal,expected]of Object.entries({pago:"aprovado",falhou:"recusado",estornado:"cancelado",cancelado:"cancelado",estorno_pendente:"pendente",cancelamento_pendente:"pendente",pendente:"pendente"}))assert.equal(serializePublicPayment({id:"uuid",status:internal,dados:{},valor:108.5}).status,expected);assert.throws(()=>serializePublicPayment({id:"uuid",status:"conciliacao",dados:{},valor:108.5}),(error:any)=>error.codigo==="conciliacao_pendente");assert.throws(()=>serializePublicPayment({id:"uuid",status:"legado_desconhecido",dados:{},valor:108.5}),(error:any)=>error.codigo==="estado_financeiro_desconhecido");});
for(const script of ["test:integration","test:financial"])test(`${script} exige banco configurado e não dá verde com zero testes`,()=>{const result=spawnSync("npm",["run",script],{cwd:process.cwd(),env:{...process.env,TEST_DATABASE_URL:""},encoding:"utf8",timeout:15000});assert.notEqual(result.status,0,`${script} terminou com sucesso sem banco`);assert.match(result.stderr, new RegExp(`TEST_DATABASE_URL é obrigatório para ${script}`));});
