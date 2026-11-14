import assert from "node:assert/strict";
import test from "node:test";
import crypto from "node:crypto";
import type { AddressInfo } from "node:net";

const database=process.env.TEST_DATABASE_URL;
if(!database)throw new Error("TEST_DATABASE_URL é obrigatório para test:financial");
if(!new URL(database).pathname.startsWith("/vizin_contract_test_"))throw new Error("Banco de teste isolado obrigatório");
process.env.DATABASE_URL=database;process.env.VIZIN_NO_LISTEN="true";process.env.NODE_ENV="test";process.env.PAYMENT_MODE="gateway";
process.env.JWT_KEY="vizin-test-secret-with-at-least-32-characters";process.env.MP_ACCESS_TOKEN="sandbox-test-token";process.env.MP_WEBHOOK_SECRET="sandbox-webhook-secret";process.env.MP_NOTIFICATION_URL="https://example.test/api/assinaturas/webhook";

const png=Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+ip1sAAAAASUVORK5CYII=","base64");
function makeCpf(){let s=String(crypto.randomInt(100000000,999999999));for(const n of[9,10])s+=String(([...s].reduce((a,d,i)=>a+Number(d)*(n+1-i),0)*10%11)%10);return s;}

test("planos, cota concorrente, webhook e cancelamento usam PostgreSQL",async t=>{
 const previousFetch=globalThis.fetch;let seq=1000;const remote=new Map<string,any>();let lastAmount=0;
 globalThis.fetch=async(input,init)=>{
  const url=new URL(String(input));if(url.origin!=="https://api.mercadopago.com")return previousFetch(input,init);
  const body=init?.body?JSON.parse(String(init.body)):{};
  if(url.pathname==="/v1/payments"&&init?.method==="POST"){
   lastAmount=body.transaction_amount;const id=String(++seq);const rejected=body.description.includes("Avançado-recusado");
   const row={id,status:rejected?"rejected":"pending",currency_id:"BRL",transaction_amount:body.transaction_amount,external_reference:body.external_reference,metadata:body.metadata,date_of_expiration:body.date_of_expiration,point_of_interaction:{transaction_data:{qr_code:`PIX-${id}`,qr_code_base64:"aW1hZ2U="}}};remote.set(id,row);return new Response(JSON.stringify(row),{status:201,headers:{"Content-Type":"application/json"}});
  }
  if(url.pathname==="/v1/payments/search")return new Response(JSON.stringify({results:[...remote.values()].filter(p=>p.external_reference===url.searchParams.get("external_reference"))}),{status:200,headers:{"Content-Type":"application/json"}});
  const match=/^\/v1\/payments\/(\w+)$/.exec(url.pathname);if(match&&remote.has(match[1]!))return new Response(JSON.stringify(remote.get(match[1]!)),{status:200,headers:{"Content-Type":"application/json"}});
  throw new Error(`Mercado Pago fake não esperava ${init?.method} ${url.pathname}`);
 };
 const {default:app}=await import("../../app.ts"),{default:prisma}=await import("../../app/config/database.ts"),{default:jwt}=await import("jsonwebtoken");
 const server=app.listen(0,"127.0.0.1");await new Promise<void>(resolve=>server.once("listening",resolve));const base=`http://127.0.0.1:${(server.address() as AddressInfo).port}/api`;
 t.after(async()=>{globalThis.fetch=previousFetch;await new Promise<void>((resolve,reject)=>server.close(e=>e?reject(e):resolve()));await prisma.$disconnect();});
 const user=await prisma.usuarios.create({data:{nome:"Assinante",email:`plan-${crypto.randomUUID()}@test.local`,cpf:makeCpf(),senha_hash:"not-used"}});
 const token=jwt.sign({id:user.id,email:user.email,tipo:user.tipo,tokenVersion:user.token_version},process.env.JWT_KEY!);
 async function api(path:string,method="GET",body?:any,key?:string){const headers:Record<string,string>={Authorization:`Bearer ${token}`};if(key)headers["Idempotency-Key"]=key;if(body&&!(body instanceof FormData))headers["Content-Type"]="application/json";const response=await fetch(base+path,{method,headers,...(body===undefined?{}:{body:body instanceof FormData?body:JSON.stringify(body)})});return{status:response.status,data:await response.json() as any};}
 function item(title:string){const form=new FormData();Object.entries({titulo:title,descricao:"Objeto de integração",categoria:"ferramentas",preco_dia:"10",valor_mercado:"100",localizacao:"São Paulo"}).forEach(([k,v])=>form.append(k,v));form.append("fotos",new Blob([png],{type:"image/png"}),"foto.png");return form;}
 async function webhook(ref:string,event:string,valid=true){const request=`req-${event}`,ts=String(Math.floor(Date.now()/1000)),hash=crypto.createHmac("sha256",process.env.MP_WEBHOOK_SECRET!).update(`id:${ref};request-id:${request};ts:${ts};`).digest("hex");const response=await fetch(`${base}/assinaturas/webhook?data.id=${ref}`,{method:"POST",headers:{"Content-Type":"application/json","x-request-id":request,"x-signature":`ts=${ts},v1=${valid?hash:"0".repeat(64)}`},body:JSON.stringify({id:event,type:"payment",data:{id:ref}})});return{status:response.status,data:await response.json() as any};}

 const plans=await api("/planos");assert.equal(plans.status,200);assert.deepEqual(plans.data.map((p:any)=>[p.codigo,p.preco_centavos,p.limite_publicacoes]),[["gratuito",0,1],["intermediario",2999,10],["avancado",5999,30]]);
 let current=await api("/usuarios/me/assinatura");assert.equal(current.data.plano.codigo,"gratuito");assert.equal(current.data.publicacoes.disponiveis,1);
 const firstKey=crypto.randomUUID(),first=await api("/objetos","POST",item("Primeiro"),firstKey);assert.equal(first.status,201,JSON.stringify(first.data));
 const retry=await api("/objetos","POST",item("Primeiro"),firstKey);assert.equal(retry.status,200);assert.equal(retry.data.id,first.data.id);assert.equal(await prisma.publicacoes_anuncio.count({where:{usuario_id:user.id}}),1);
 const conflictingRetry=await api("/objetos","POST",item("Repetido"),firstKey);assert.equal(conflictingRetry.status,409);assert.equal(conflictingRetry.data.codigo,"idempotencia_conflitante");
 assert.equal((await api("/objetos","POST",item("Segundo"),crypto.randomUUID())).data.codigo,"limite_anuncios_atingido");

 const tokenBefore=process.env.MP_ACCESS_TOKEN;delete process.env.MP_ACCESS_TOKEN;
 const missingProvider=await api("/assinaturas","POST",{plano_codigo:"intermediario",metodo:"pix"},"sem-credenciais");
 assert.equal(missingProvider.status,503);assert.equal(await prisma.pagamentos_assinatura.count({where:{usuario_id:user.id}}),0);
 process.env.MP_ACCESS_TOKEN=tokenBefore;

 const contract=await api("/assinaturas","POST",{plano_codigo:"intermediario",metodo:"pix",preco_centavos:1},"contrato-1");assert.equal(contract.status,202,JSON.stringify(contract.data));assert.equal(lastAmount,29.99);assert.equal((await api("/usuarios/me/assinatura")).data.plano.codigo,"gratuito");
 const local=await prisma.pagamentos_assinatura.findUniqueOrThrow({where:{id:contract.data.id}});const provider=remote.get(local.referencia_pagamento!);
 await prisma.pagamentos_assinatura.update({where:{id:local.id},data:{referencia_pagamento:null,dados:{}}});
 assert.equal((await api(`/pagamentos-assinatura/${local.id}`)).data.pix.copia_e_cola,`PIX-${local.referencia_pagamento}`);
 assert.equal((await prisma.pagamentos_assinatura.findUniqueOrThrow({where:{id:local.id}})).referencia_pagamento,local.referencia_pagamento);
 provider.status="approved";
 assert.equal((await webhook(local.referencia_pagamento!,"evt-1",false)).status,401);
 provider.metadata={...provider.metadata,usuario_id:crypto.randomUUID()};
 assert.equal((await webhook(local.referencia_pagamento!,"evt-identity")).status,422);
 assert.equal((await api("/usuarios/me/assinatura")).data.plano.codigo,"gratuito");
 provider.metadata.usuario_id=user.id;
 assert.equal((await api(`/pagamentos-assinatura/${local.id}`)).data.status,"pago");
 assert.equal((await webhook(local.referencia_pagamento!,"evt-1")).status,200);assert.equal((await webhook(local.referencia_pagamento!,"evt-1")).status,200);
 current=await api("/usuarios/me/assinatura");assert.equal(current.data.plano.codigo,"intermediario");assert.equal(current.data.publicacoes.limite,10);assert.equal(await prisma.notificacoes.count({where:{chave:`assinatura_ativada:${local.id}`}}),1);
 provider.status="rejected";assert.equal((await webhook(local.referencia_pagamento!,"evt-fora-de-ordem")).status,200);assert.equal((await prisma.pagamentos_assinatura.findUniqueOrThrow({where:{id:local.id}})).status,"pago");

 for(let i=0;i<9;i++)assert.equal((await api("/objetos","POST",item(`Pago ${i}`),crypto.randomUUID())).status,201);
 const simultaneous=await Promise.all([api("/objetos","POST",item("Concorrente A"),crypto.randomUUID()),api("/objetos","POST",item("Concorrente B"),crypto.randomUUID())]);assert.deepEqual(simultaneous.map(r=>r.status).sort(),[201,409]);
 current=await api("/usuarios/me/publicacoes");assert.equal(current.data.publicacoes.utilizadas,10);assert.equal(current.data.publicacoes.disponiveis,0);
 assert.equal((await api(`/objetos/${first.data.id}`,"PATCH",{descricao:"Editado sem consumir"})).status,200);assert.equal((await api("/usuarios/me/publicacoes")).data.publicacoes.utilizadas,10);

 const subscriptionId=current.data.assinatura.id;const cancelled=await api(`/assinaturas/${subscriptionId}/cancelar`,"POST",{});assert.equal(cancelled.status,200);assert.equal(cancelled.data.cancelar_ao_final,true);assert.equal((await api("/usuarios/me/assinatura")).data.plano.codigo,"intermediario");
 await prisma.assinaturas.update({where:{id:subscriptionId},data:{fim:new Date("2020-01-01")}});current=await api("/usuarios/me/assinatura");assert.equal(current.data.plano.codigo,"gratuito");assert.equal(await prisma.itens.count({where:{usuario_id:user.id}}),11);
 const historical=await api(`/assinaturas/${subscriptionId}`);assert.equal(historical.status,200);assert.equal(historical.data.assinatura.id,subscriptionId);assert.equal(historical.data.assinatura.status,"expirada");
 const refused=await api("/assinaturas","POST",{plano_codigo:"avancado",metodo:"pix",preco_centavos:1},"contrato-recusado");assert.equal(refused.status,202);const refusedLocal=await prisma.pagamentos_assinatura.findUniqueOrThrow({where:{id:refused.data.id}});remote.get(refusedLocal.referencia_pagamento!).status="rejected";assert.equal((await webhook(refusedLocal.referencia_pagamento!,"evt-recusa")).status,200);assert.equal((await api("/usuarios/me/assinatura")).data.plano.codigo,"gratuito");assert.equal((await prisma.pagamentos_assinatura.findUniqueOrThrow({where:{id:refusedLocal.id}})).status,"falhou");
 const advanced=await api("/assinaturas","POST",{plano_codigo:"avancado",metodo:"pix",preco_centavos:1},"contrato-avancado");const advancedLocal=await prisma.pagamentos_assinatura.findUniqueOrThrow({where:{id:advanced.data.id}});remote.get(advancedLocal.referencia_pagamento!).status="approved";assert.equal((await webhook(advancedLocal.referencia_pagamento!,"evt-avancado")).status,200);current=await api("/usuarios/me/publicacoes");assert.equal(current.data.publicacoes.limite,30);for(let i=current.data.publicacoes.utilizadas;i<30;i++)assert.equal((await api("/objetos","POST",item(`Avançado ${i}`),crypto.randomUUID())).status,201);assert.equal((await api("/objetos","POST",item("Avançado excedente"),crypto.randomUUID())).status,409);
 remote.get(advancedLocal.referencia_pagamento!).status="refunded";assert.equal((await webhook(advancedLocal.referencia_pagamento!,"evt-estorno")).status,200);assert.equal((await api("/usuarios/me/assinatura")).data.plano.codigo,"gratuito");assert.equal((await prisma.pagamentos_assinatura.findUniqueOrThrow({where:{id:advancedLocal.id}})).status,"estornado");
});
