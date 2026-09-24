// Percorre a API com banco real, cobrindo cadastro, anúncios, aluguel, comunicação e segurança.
import assert from "node:assert/strict";
import test from "node:test";
import type { AddressInfo } from "node:net";
import crypto from "node:crypto";
const database=process.env.TEST_DATABASE_URL;
if(!database)throw new Error("TEST_DATABASE_URL é obrigatório para test:integration");
if(!new URL(database).pathname.startsWith("/vizin_contract_test_")) throw new Error("Use banco isolado vizin_contract_test_* para testes");process.env.DATABASE_URL=database;process.env.VIZIN_NO_LISTEN="true";process.env.NODE_ENV="dev";process.env.PAYMENT_MODE="demo";process.env.JWT_KEY="vizin-test-secret-with-at-least-32-characters";
function makeCpf() {
 let s=String(crypto.randomInt(100000000,999999999));
 for(const n of [9,10]) {const sum=[...s].reduce((a,d,i)=>a+Number(d)*(n+1-i),0);s+=String((sum*10%11)%10);}return s;
}
const png=Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+ip1sAAAAASUVORK5CYII=","base64");
function photos(fields:Record<string,string>={},names=["fotos"]) {const form=new FormData();for(const[k,v]of Object.entries(fields))form.append(k,v);for(const name of names)form.append(name,new Blob([png],{type:"image/png"}),"foto.png");return form;}
test("API → PostgreSQL/PostGIS: contratos e fluxos críticos",async t=>{
 const {default:app}=await import("../../app.ts");const {default:prisma}=await import("../../app/config/database.ts");
 const server=app.listen(0,"127.0.0.1");await new Promise<void>(resolve=>server.once("listening",resolve));const base=`http://127.0.0.1:${(server.address() as AddressInfo).port}/api`;
 t.after(async()=>{await new Promise<void>((resolve,reject)=>server.close(e=>e?reject(e):resolve()));await prisma.$disconnect();});
 async function api(path:string,method="GET",body?:unknown,cookie?:string,extraHeaders:Record<string,string>={}) {
  const headers:Record<string,string>={Origin:"http://localhost:8080",...extraHeaders};if(cookie)headers.Cookie=cookie;
  if(body && !(body instanceof FormData))headers["Content-Type"]="application/json";
  const r=await fetch(base+path,{method,headers,...(body?{body:body instanceof FormData?body:JSON.stringify(body)}:{})});
  const data=await r.json() as any;return{status:r.status,data,cookie:r.headers.get("set-cookie")?.split(";")[0]??""};
 }
 const owner={nome:"Proprietário",cpf:makeCpf(),email:`owner-${crypto.randomUUID()}@test.local`,senha:"senha12345",whatsapp:"11999999999"};
 const renter={nome:"Locatário",cpf:makeCpf(),email:`renter-${crypto.randomUUID()}@test.local`,senha:"senha12345"};
 const stranger={nome:"Terceiro",cpf:makeCpf(),email:`stranger-${crypto.randomUUID()}@test.local`,senha:"senha12345"};
 let ownerId="",renterId="",ownerCookie="",renterCookie="",strangerCookie="",adminCookie="",itemId="",rentalId="",paymentId="";
 const today=new Date().toISOString().slice(0,10);
 await t.test("cadastro CPF, duplicado e inválido",async()=>{
  let r=await api("/usuarios","POST",owner);assert.equal(r.status,201);ownerId=r.data.usuario.id;assert.equal(typeof ownerId,"string");
  assert.equal((await api("/usuarios","POST",{...owner,email:`duplicate-${crypto.randomUUID()}@test.local`})).status,409);
  assert.equal((await api("/usuarios","POST",{...owner,cpf:"11111111111"})).status,422);
  r=await api("/usuarios","POST",renter);assert.equal(r.status,201);renterId=r.data.usuario.id;
  assert.equal((await api("/usuarios","POST",stranger)).status,201);
 });
 await t.test("login CPF, senha incorreta e sessão",async()=>{
  assert.equal((await api("/login","POST",{cpf:owner.cpf,senha:"incorreta"})).status,401);
  assert.equal((await api("/login","POST",{email:owner.email,senha:owner.senha})).status,422);
  const r=await api("/login","POST",{cpf:owner.cpf.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/,"$1.$2.$3-$4"),senha:owner.senha});assert.equal(r.status,200);ownerCookie=r.cookie;
  renterCookie=(await api("/login","POST",renter)).cookie;strangerCookie=(await api("/login","POST",stranger)).cookie;
  assert.equal((await api("/login/sessao","GET",undefined,ownerCookie)).data.id,ownerId);
  assert.equal((await api("/usuarios/me")).status,401);
  const profile=(await api(`/usuarios/${ownerId}`)).data;for(const field of["cpf","email","telefone","whatsapp","senha_hash"])assert.equal(profile[field],undefined);
 });
 await t.test("endereço com coordenadas e objeto multipart",async()=>{
  const a=await api("/usuarios/me/enderecos","POST",{cep:"01001-000",rua:"Praça da Sé",numero:"1",bairro:"Sé",cidade:"São Paulo",estado:"SP",latitude:-23.55,longitude:-46.63,principal:true},ownerCookie);assert.equal(a.status,201,JSON.stringify(a.data));
  const r=await api("/objetos","POST",photos({titulo:"Furadeira",descricao:"Furadeira para testes",categoria:"Ferramentas",preco_dia:"10",valor_mercado:"300",localizacao:"São Paulo",endereco_id:a.data.id}),ownerCookie);assert.equal(r.status,201,JSON.stringify(r.data));itemId=r.data.id;
  assert.equal((await api("/objetos?latitude=-23.55&longitude=-46.63&raio=1")).data.some((i:any)=>i.id===itemId),true);
  assert.equal((await api("/objetos?latitude=0&longitude=0&raio=1")).data.some((i:any)=>i.id===itemId),false);
 });
 await t.test("PATCH parcial, autorização, categorias e filtro do proprietário",async()=>{
  assert.equal((await api(`/objetos/${itemId}`,"PATCH",{disponivel:false},renterCookie)).status,403);
  assert.equal((await api(`/objetos/${itemId}`,"PATCH",{disponivel:false},ownerCookie)).status,200);
  assert.equal((await api(`/objetos?proprietarioId=${ownerId}`,"GET",undefined,ownerCookie)).data.length,1);
  assert.equal((await api(`/objetos/${itemId}`,"PATCH",{disponivel:true},ownerCookie)).status,200);
  assert.equal((await api(`/objetos/${itemId}`,"PATCH",{preco_dia:12},ownerCookie)).data.preco,12);
  const legacy=await prisma.itens.create({data:{usuario_id:ownerId,titulo:"Legado",preco_por_dia:1,valor_mercado:30}});
  assert.equal((await api(`/objetos/${legacy.id}`,"PATCH",{disponivel:false},ownerCookie)).status,200);
  assert.equal((await api(`/objetos/${legacy.id}`,"DELETE",undefined,ownerCookie)).status,200);
 });
 await t.test("objetos: multipart, limites, aliases, fotos, filtros e privacidade",async()=>{
  const fields={nome:"Contrato de objetos",descricao:"Descrição",categoria:"eletronicos",preco:"25",localizacao_texto:"São Paulo",proprietarioId:renterId,usuario_id:renterId,email:renter.email};
  assert.equal((await api("/objetos","POST",fields,ownerCookie)).status,422);
  assert.equal((await api("/objetos","POST",photos(fields,[]),ownerCookie)).status,422);
  assert.equal((await api("/objetos","POST",photos(fields,Array(6).fill("fotos")),ownerCookie)).status,422);
  for(const [bytes,mime] of [[Buffer.alloc(5*1024*1024+1),"image/png"],[Buffer.from("invalid"),"image/png"],[png.subarray(0,png.length-5),"image/png"],[png,"text/plain"]] as const) {
   const form=photos(fields,[]);form.append("fotos",new Blob([bytes],{type:mime}),"foto.png");
   assert.equal((await api("/objetos","POST",form,ownerCookie)).status,422);
  }
  const created=await api("/objetos","POST",photos(fields,Array(5).fill("fotos")),ownerCookie);
  assert.equal(created.status,201,JSON.stringify(created.data));assert.equal(created.data.fotos.length,5);
  const id=created.data.id,path=`/objetos/${id}`,original=created.data.fotos;
  assert.equal(created.data.proprietario.id,ownerId);assert.equal(created.data.categoria.slug,"eletronicos");
  for(const method of ["PATCH","PUT","DELETE"])assert.equal((await api(path,method,method==="DELETE"?undefined:{titulo:"Roubo",usuario_id:renterId},renterCookie)).status,403);
  for(const method of ["PATCH","PUT","DELETE"])assert.equal((await api(path,method,method==="DELETE"?undefined:{disponivel:false})).status,401);
  const partial=await api(path,"PATCH",{disponivel:false},ownerCookie);assert.equal(partial.status,200);assert.deepEqual(partial.data.fotos,original);
  assert.equal((await api(`/objetos?proprietarioId=${ownerId}`,"GET",undefined,ownerCookie)).data.some((i:any)=>i.id===id),true);
  assert.equal((await api(`/objetos?proprietarioId=${renterId}`)).data.some((i:any)=>i.id===id),false);
  assert.equal((await api("/objetos?disponivel=true")).data.some((i:any)=>i.id===id),false);
  assert.equal((await api("/objetos/meus","GET",undefined,ownerCookie)).data.some((i:any)=>i.id===id),true);
  assert.equal((await api(path,"PUT",{disponivel:true},ownerCookie)).status,200);
  const publicItem=(await api(path)).data;assert.equal(publicItem.proprietario.id,ownerId);
  function checkPrivate(value:any):void {if(value && typeof value==="object")for(const[k,v]of Object.entries(value)){assert.ok(!["cpf","email","telefone","whatsapp","rua","numero","complemento","cep","enderecos"].includes(k),k);checkPrivate(v);}}
  checkPrivate(publicItem);
  assert.equal((await api(path,"PATCH",{fotos_mantidas:[]},ownerCookie)).status,422);
  assert.equal((await api(path,"PATCH",{fotos_mantidas:[crypto.randomUUID()]},ownerCookie)).status,422);
  assert.equal((await api(path,"PATCH",photos({},["fotos_novas"]),ownerCookie)).status,422);
  const kept=[original[2].id,original[0].id];
  const edited=await api(path,"PATCH",photos({fotos_mantidas:JSON.stringify(kept),foto_principal_index:"2"},["fotos_novas"]),ownerCookie);
  assert.equal(edited.status,200);assert.equal(edited.data.fotos.length,3);for(const id of kept)assert.ok(edited.data.fotos.some((p:any)=>p.id===id));
  assert.equal(edited.data.fotos.filter((p:any)=>p.principal).length,1);assert.ok(!kept.includes(edited.data.fotos[0].id));
  const preserved=await api(path,"PATCH",{descricao:"Atualizada"},ownerCookie);assert.deepEqual(preserved.data.fotos,edited.data.fotos);
  const categories=(await api("/categorias")).data;assert.deepEqual((await api("/objetos/categorias")).data,categories);
  const casa=await api(path,"PATCH",{categoria:"  CASA E JÁRDIM  "},ownerCookie);assert.equal(casa.status,200);assert.equal(casa.data.categoria.slug,"casajardim");
  assert.equal((await api(path,"PATCH",{categoria_id:casa.data.categoria.id},ownerCookie)).data.categoria.id,casa.data.categoria.id);
  assert.equal((await api(path,"DELETE",undefined,ownerCookie)).status,200);assert.equal((await api(path)).status,404);
 });
 await t.test("objetos: aluguel ativo e pendência retornam conflitos programáticos",async()=>{
  const created=await api("/objetos","POST",photos({titulo:"Bloqueios",descricao:"Teste",categoria:"ferramentas",preco:"25",localizacao:"São Paulo"}),ownerCookie);
  assert.equal(created.status,201);const id=created.data.id,path=`/objetos/${id}`;
  const rental=await prisma.alugueis.create({data:{item_id:id,locador_id:ownerId,locatario_id:renterId,data_inicio:new Date(today),data_fim:new Date(today),valor_total:25,status:"pendente"}});
  async function conflict(method:string,body:unknown,codigo:string,message:string) {
   const r=await api(path,method,body,ownerCookie);assert.equal(r.status,409);assert.deepEqual(r.data,{success:false,message,mensagem:message,codigo});
  }
  await conflict("DELETE",undefined,"OBJETO_COM_SOLICITACAO_PENDENTE","O objeto possui uma solicitação pendente.");
  for(const body of [{disponivel:false},{disponivel_imediato:false}])await conflict("PATCH",body,"OBJETO_COM_SOLICITACAO_PENDENTE","O objeto possui uma solicitação pendente.");
  assert.equal((await api(path,"PATCH",{disponivel:true,preco:30},ownerCookie)).status,200);
  assert.equal((await prisma.alugueis.findUniqueOrThrow({where:{id:rental.id}})).valor_total.toString(),"25");
  for(const status of ["aprovado","pago","retirado","devolvido"]) {
   await prisma.alugueis.update({where:{id:rental.id},data:{status}});
   for(const body of [{titulo:"Mudança"},{descricao:"Mudança"},{preco:40},{categoria:"camping"},{disponivel:false},{disponivel_imediato:false},{foto_principal_index:0},photos({},["fotos_novas"])])await conflict("PATCH",body,"OBJETO_EM_LOCACAO","O objeto possui uma locação ativa.");
   await conflict("PUT",{disponivel:false},"OBJETO_EM_LOCACAO","O objeto possui uma locação ativa.");
   await conflict("DELETE",undefined,"OBJETO_EM_LOCACAO","O objeto possui uma locação ativa.");
  }
  assert.deepEqual((await api(path)).data.fotos,created.data.fotos);
  await prisma.alugueis.update({where:{id:rental.id},data:{status:"finalizado"}});
  assert.equal((await api(path,"PATCH",{disponivel:false},ownerCookie)).status,200);
  const deleted=await api(path,"DELETE",undefined,ownerCookie);assert.equal(deleted.status,200);assert.equal(deleted.data.arquivado,true);
 });
 await t.test("datas, cálculo servidor, conflito e IDOR",async()=>{
  assert.equal((await api("/solicitacoes","POST",{objeto_id:itemId,data_retirada:"2020-01-01",data_devolucao:today},renterCookie)).status,422);
  const r=await api("/solicitacoes","POST",{objeto_id:itemId,data_retirada:today,data_devolucao:today,total:1,proprietarioId:renterId},renterCookie);assert.equal(r.status,201,JSON.stringify(r.data));rentalId=r.data.id;assert.equal(r.data.total,13.2);assert.equal(r.data.subtotal,12);
  assert.equal((await api("/solicitacoes","POST",{objeto_id:itemId,data_retirada:today,data_devolucao:today},strangerCookie)).status,201);
  assert.equal((await api(`/solicitacoes/${rentalId}`,"GET",undefined,strangerCookie)).status,403);
  assert.equal((await api(`/objetos/${itemId}`,"PATCH",{preco:20},ownerCookie)).status,200);
  assert.equal((await api(`/solicitacoes/${rentalId}`,"GET",undefined,renterCookie)).data.total,13.2);
  assert.equal((await api("/usuarios/me","DELETE",{senha:renter.senha},renterCookie)).status,409);
 });
 await t.test("aceitar, impedir status arbitrário e pagar PIX",async()=>{
  assert.equal((await api(`/solicitacoes/${rentalId}`,"PATCH",{status:"aprovado"},renterCookie)).status,403);
  assert.equal((await api(`/solicitacoes/${rentalId}`,"PATCH",{status:"aprovado"},ownerCookie)).status,200);
  assert.equal((await api(`/solicitacoes/${rentalId}`,"PATCH",{status:"pago"},renterCookie)).status,422);
  const p=await api("/pagamentos/pix/gerar","POST",{aluguel_id:rentalId},renterCookie);assert.equal(p.status,200);paymentId=p.data.id;assert.equal(p.data.ambiente,"simulado");
  assert.equal((await api(`/pagamentos/${paymentId}/status`,"GET",undefined,strangerCookie)).status,403);
  assert.equal((await api("/pagamentos/pix/confirmar","POST",{aluguel_id:rentalId},renterCookie)).status,200);
  assert.equal((await api("/pagamentos/pix/confirmar","POST",{aluguel_id:rentalId},renterCookie)).status,200);
  assert.equal(await prisma.pagamentos.count({where:{aluguel_id:rentalId,status:"pago"}}),1);
 });
 await t.test("retirada exige fotos de ambas as partes",async()=>{
  assert.equal((await api(`/retiradas/${rentalId}/fotos`,"POST",photos(),strangerCookie)).status,403);
  let r=await api(`/retiradas/${rentalId}/fotos`,"POST",photos({observacoes:"Sem danos"}),renterCookie);assert.equal(r.status,201);assert.equal(r.data.status,"pago");
  assert.equal((await api(`/retiradas/${rentalId}/fotos`,"POST",photos(),renterCookie)).status,409);
  r=await api(`/retiradas/${rentalId}/fotos`,"POST",photos(),ownerCookie);assert.equal(r.status,201);assert.equal(r.data.status,"retirado");assert.ok(r.data.concluidoEm);
  const url=r.data.locatario.fotos[0];
  const host=base.slice(0,-4);
  for(const variant of [url,url.replace("/withdrawals/","//withdrawals/"),url.replace("/withdrawals/","/%2Fwithdrawals/"),url.replace("/withdrawals/","/withdrawals%2F"),url.replace("/withdrawals/","/withdrawals/../withdrawals/"),url.replace("/withdrawals/","/%5cwithdrawals/"),url.replace("/withdrawals/","/%252Fwithdrawals/")]) {
   const response=await fetch(host+variant);
   assert.notEqual(response.status,200,variant);
   assert.notEqual(response.headers.get("content-type"),"image/png",variant);
  }
  assert.equal((await fetch(base.replace(/\/api$/,"")+url)).status,401);
  assert.equal((await fetch(base.replace(/\/api$/,"")+url,{headers:{Cookie:strangerCookie}})).status,404);
  assert.equal((await fetch(base.replace(/\/api$/,"")+url,{headers:{Cookie:renterCookie}})).status,200);
 });
 await t.test("foto de retirada aceita admin alheio ao aluguel",async()=>{
  const photo=await prisma.fotos_retirada.findFirstOrThrow({where:{retiradas:{aluguel_id:rentalId}}});
  const admin=await prisma.usuarios.create({data:{nome:"Admin fotos",cpf:makeCpf(),email:`photo-admin-${crypto.randomUUID()}@test.local`,senha_hash:"x",tipo:"admin"}});
  const {default:jwt}=await import("jsonwebtoken");const {default:env}=await import("../../app/config/env.ts");
  const token=jwt.sign({id:admin.id,email:admin.email,tipo:admin.tipo,tokenVersion:admin.token_version},env.JWT_KEY);
  assert.equal((await fetch(base.slice(0,-4)+photo.url,{headers:{Authorization:`Bearer ${token}`}})).status,200);
 });
 await t.test("devolução, finalização, avaliação e histórico",async()=>{
  assert.equal((await api(`/alugueis/${rentalId}/avaliacao`,"POST",{nota:5},renterCookie)).status,409);
  assert.equal((await api(`/solicitacoes/${rentalId}`,"PATCH",{status:"aguardando_devolucao"},renterCookie)).status,409);
  assert.equal((await api(`/devolucoes/${rentalId}/fotos`,"POST",photos(),renterCookie)).status,201);
  assert.equal((await api(`/solicitacoes/${rentalId}`,"PATCH",{status:"aguardando_devolucao"},renterCookie)).status,200);
  const r=await api(`/devolucoes/${rentalId}/fotos`,"POST",photos(),ownerCookie);assert.equal(r.status,201);assert.equal(r.data.status,"devolvido");
  assert.equal((await api(`/solicitacoes/${rentalId}`,"PATCH",{status:"concluido"},ownerCookie)).status,200);
  assert.equal((await api(`/alugueis/${rentalId}/avaliacao`,"POST",{nota:5,comentario:"Ótima experiência"},renterCookie)).status,201);
  assert.equal((await api(`/alugueis/${rentalId}/avaliacao`,"POST",{nota:4},renterCookie)).status,409);
  assert.equal((await api("/avaliacoes","POST",{aluguel_id:rentalId,nota:4,comentario:"Bom locatário"},ownerCookie)).status,201);
  assert.equal((await api(`/alugueis/${rentalId}/avaliacoes`,"GET",undefined,renterCookie)).data.length,2);
  assert.equal((await api(`/objetos/${itemId}`)).data.media,5);
  assert.equal((await api(`/usuarios/${renterId}`)).data.avaliacaoMedia,4);
  const ownerProfile=(await api(`/usuarios/${ownerId}`)).data;assert.equal(ownerProfile.avaliacaoMedia,0);assert.equal(ownerProfile.avaliacaoProprietarioMedia,5);
  assert.equal((await api("/alugueis/historico","GET",undefined,ownerCookie)).status,200);
 });
 await t.test("recusar com alias, cancelar e expirar solicitação",async()=>{
  const tomorrow=new Date(Date.now()+86400000).toISOString().slice(0,10);
  const body={objeto_id:itemId,data_retirada:tomorrow,data_devolucao:tomorrow};
  let r=await api("/solicitacoes","POST",body,renterCookie);assert.equal(r.status,201);
  assert.equal((await api(`/solicitacoes/${r.data.id}`,"PATCH",{status:"rejeitado"},ownerCookie)).data.status,"recusado");
  r=await api("/solicitacoes","POST",body,renterCookie);assert.equal((await api(`/solicitacoes/${r.data.id}`,"PATCH",{status:"cancelado"},renterCookie)).status,200);
  r=await api("/solicitacoes","POST",body,renterCookie);await prisma.alugueis.update({where:{id:r.data.id},data:{expira_em:new Date(0)}});
  assert.equal((await api(`/solicitacoes/${r.data.id}`,"GET",undefined,renterCookie)).data.status,"cancelado");
 });
 await t.test("conversas persistem, protegem IDOR, leitura e bloqueio",async()=>{
  const c=await api("/conversations","POST",{userId:ownerId,produtoId:itemId},renterCookie);assert.equal(c.status,201);const id=c.data.id;
  assert.equal((await api(`/conversations/${id}/messages`,"POST",{text:"Olá"},renterCookie)).status,201);
  assert.equal((await api(`/conversations/${id}/messages`,"GET",undefined,strangerCookie)).status,404);
  assert.equal((await api("/conversations","GET",undefined,ownerCookie)).data[0].unreadCount,1);
  assert.equal((await api(`/conversations/${id}/read`,"POST",{},ownerCookie)).status,200);
  assert.equal((await api(`/conversations/${id}/block`,"POST",{},ownerCookie)).status,200);
  assert.equal((await api(`/conversations/${id}/messages`,"POST",{text:"Bloqueado"},renterCookie)).status,403);
  assert.equal((await api(`/users/${renterId}/unblock`,"POST",{},ownerCookie)).status,200);
  const a=await api("/uploads","POST",photos({},["file"]),renterCookie);assert.equal(a.status,201,JSON.stringify(a.data));
  assert.equal((await api(`/conversations/${id}/messages`,"POST",{attachmentId:a.data.id},renterCookie)).status,201);
  assert.equal((await api(`/conversations/${id}/report`,"POST",{motivo:"outro",mensagem:"Denúncia de teste"},renterCookie)).status,201);
  assert.equal((await api(`/conversations/${id}`,"DELETE",undefined,renterCookie)).status,200);
  assert.equal((await api("/conversations","GET",undefined,renterCookie)).data.length,0);
 });
 await t.test("suporte real, exportação e preferências",async()=>{
  const s=await api("/suporte/ajuda","POST",{assunto:"Ajuda",mensagem:"Mensagem"},renterCookie);assert.equal(s.status,201);assert.ok(await prisma.suportes.findUnique({where:{id:s.data.id}}));
  assert.equal((await api("/usuarios/privacidade","PUT",{perfilPublico:false},renterCookie)).status,200);
  assert.equal((await api(`/usuarios/${renterId}`)).status,404);
  assert.equal((await api("/usuarios/preferencias-notificacao")).status,401);
  assert.equal((await api("/usuarios/preferencias-notificacao","PUT",{mensagens:false})).status,401);
  const defaults=(await api("/usuarios/preferencias-notificacao","GET",undefined,renterCookie)).data;
  assert.equal(defaults.mensagens,true);assert.equal(defaults.novidades,false);
  assert.equal((await api("/usuarios/preferencias-notificacao","PUT",{mensagens:"sim"},renterCookie)).status,422);
  assert.equal((await api("/usuarios/preferencias-notificacao","PUT",{desconhecida:true},renterCookie)).status,422);
  assert.equal((await api("/usuarios/preferencias-notificacao","PUT",{mensagens:false},renterCookie)).status,200);
  assert.equal((await api("/usuarios/preferencias-notificacao","GET",undefined,renterCookie)).data.mensagens,false);
  assert.equal((await api("/usuarios/preferencias-notificacao","GET",undefined,ownerCookie)).data.mensagens,true);

  const c=await api("/conversations","POST",{userId:ownerId,produtoId:itemId},renterCookie);
  await api("/usuarios/preferencias-notificacao","PUT",{mensagens:false},ownerCookie);
  const beforeMessages=await prisma.mensagens.count({where:{conversa_id:c.data.id}});
  const beforeNotifications=await prisma.notificacoes.count({where:{usuario_id:ownerId,tipo:"mensagem"}});
  assert.equal((await api(`/conversations/${c.data.id}/messages`,"POST",{text:"Sem alerta"},renterCookie)).status,201);
  assert.equal(await prisma.mensagens.count({where:{conversa_id:c.data.id}}),beforeMessages+1);
  assert.equal(await prisma.notificacoes.count({where:{usuario_id:ownerId,tipo:"mensagem"}}),beforeNotifications);
  await api("/usuarios/preferencias-notificacao","PUT",{mensagens:true},ownerCookie);
  assert.equal((await api(`/conversations/${c.data.id}/messages`,"POST",{text:"Com alerta"},renterCookie)).status,201);
  assert.equal(await prisma.notificacoes.count({where:{usuario_id:ownerId,tipo:"mensagem"}}),beforeNotifications+1);
  const data=(await api("/usuarios/me/exportar","GET",undefined,renterCookie)).data;assert.equal(data.perfil.senha_hash,undefined);assert.equal(data.alugueis.length>0,true);
 });
 await t.test("admin exige privilégio e revisa identidade",async()=>{
  const paths=["metricas","usuarios","objetos","alugueis","pagamentos","verificacoes","denuncias","suporte","avaliacoes","categorias","sinistros","conciliacoes","webhooks-pendentes"];
  for(const path of paths){assert.equal((await api(`/admin/${path}`)).status,401);assert.equal((await api(`/admin/${path}`,"GET",undefined,renterCookie)).status,403);}
  await prisma.usuarios.update({where:{id:ownerId},data:{tipo:"admin"}});adminCookie=(await api("/login","POST",owner)).cookie;
  for(const path of paths)assert.equal((await api(`/admin/${path}`,"GET",undefined,adminCookie)).status,200);
  const v=await api("/usuarios/verificacao","POST",photos({},["documentoFrente","documentoVerso","selfie"]),renterCookie);assert.equal(v.status,201);
  assert.equal((await api(`/admin/verificacoes/${v.data.id}`,"PATCH",{status:"aprovado"},renterCookie)).status,403);
  assert.equal((await api(`/admin/verificacoes/${v.data.id}`,"PATCH",{status:"aprovado"},adminCookie)).status,200);
  assert.equal((await api("/usuarios/me","GET",undefined,renterCookie)).data.verificado,true);
 });

 await t.test("concorrência de reserva, cartão e estorno idempotente",async()=>{
  const future=new Date(Date.now()+2*86400000).toISOString().slice(0,10);
  const body={objeto_id:itemId,data_retirada:future,data_devolucao:future};
  const attempts=await Promise.all([api("/solicitacoes","POST",body,renterCookie),api("/solicitacoes","POST",body,strangerCookie)]);
  assert.deepEqual(attempts.map(a=>a.status).sort(),[201,201]);
  const r=attempts[0]!;
  const payer=r.data.solicitanteId===renterId?renterCookie:strangerCookie;
  assert.equal((await api(`/solicitacoes/${r.data.id}`,"PATCH",{status:"aprovado"},adminCookie)).status,200);
  assert.equal((await prisma.alugueis.findUniqueOrThrow({where:{id:attempts[1]!.data.id}})).status,"recusado");
  const p=await api("/pagamentos/cartao","POST",{aluguel_id:r.data.id,tokenCartao:"token_simulado"},payer);assert.equal(p.status,200);assert.equal(p.data.status,"pago");
  assert.equal((await api(`/pagamentos/${p.data.id}/estornar`,"POST",{},payer)).data.status,"estornado");
  assert.equal((await api(`/pagamentos/${p.data.id}/estornar`,"POST",{},payer)).status,200);
  assert.equal((await api(`/solicitacoes/${r.data.id}`,"GET",undefined,payer)).data.status,"cancelado");
 });

 // Prova que eventos financeiros exigem assinatura, valor coerente e processamento único.
 await t.test("webhook autenticado confirma, valida valor e deduplica eventos",async()=>{
  const future=new Date(Date.now()+4*86400000).toISOString().slice(0,10);
  const r=await api("/solicitacoes","POST",{objeto_id:itemId,data_retirada:future,data_devolucao:future},renterCookie);assert.equal(r.status,201);
  assert.equal((await api(`/solicitacoes/${r.data.id}`,"PATCH",{status:"aprovado"},adminCookie)).status,200);
  const payment=await prisma.pagamentos.create({data:{aluguel_id:r.data.id,valor:12,metodo:"pix",status:"pendente",gateway:"real",referencia:`provider-test-${crypto.randomUUID()}`}});
  const secret="segredo-webhook-somente-testes";const previous=process.env.PAYMENT_WEBHOOK_SECRET;process.env.PAYMENT_WEBHOOK_SECRET=secret;
  async function webhook(event:Record<string,unknown>){const raw=JSON.stringify(event);const response=await fetch(base+"/pagamentos/webhook",{method:"POST",headers:{"Content-Type":"application/json","X-Webhook-Signature":crypto.createHmac("sha256",secret).update(raw).digest("hex")},body:raw});return response.status;}
  try {
   const event={id:crypto.randomUUID(),referencia:payment.referencia,valor:12,status:"pago"};
   assert.equal(await webhook({...event,valor:1}),422);
   assert.equal(await webhook(event),200);assert.equal(await webhook(event),200);
   assert.equal(await prisma.webhook_eventos.count({where:{id:event.id}}),1);
   assert.equal((await api(`/solicitacoes/${r.data.id}`,"GET",undefined,renterCookie)).data.status,"pago");
   assert.equal(await webhook({...event,id:crypto.randomUUID(),status:"estornado"}),200);
   assert.equal((await api(`/solicitacoes/${r.data.id}`,"GET",undefined,renterCookie)).data.status,"cancelado");
  } finally { if(previous===undefined)delete process.env.PAYMENT_WEBHOOK_SECRET;else process.env.PAYMENT_WEBHOOK_SECRET=previous; }
 });
 await t.test("auditoria financeira: troca cancela PIX, método e gateway persistidos",async()=>{
  const item=await prisma.itens.create({data:{usuario_id:ownerId,titulo:"Financeiro",preco_por_dia:12,valor_mercado:300}});
  async function approved(){return prisma.alugueis.create({data:{item_id:item.id,locador_id:ownerId,locatario_id:renterId,data_inicio:new Date(today),data_fim:new Date(today),valor_total:12,status:"aprovado",pagamento_ate:new Date(Date.now()+60000)}});}
  const r=await approved();
  const pix=await api("/pagamentos/pix/gerar","POST",{aluguel_id:r.id},renterCookie,{"Idempotency-Key":"same-pix"});assert.equal(pix.status,200);
  const repeatedPix=await api("/pagamentos/pix/gerar","POST",{aluguel_id:r.id},renterCookie,{"Idempotency-Key":"same-pix"});assert.equal(repeatedPix.data.id,pix.data.id,JSON.stringify(repeatedPix));
  assert.equal((await api("/pagamentos/cartao","POST",{aluguel_id:r.id,tokenCartao:"demo"},renterCookie,{"Idempotency-Key":"same-pix"})).status,409);
  assert.equal((await prisma.pagamentos.findUniqueOrThrow({where:{id:pix.data.id}})).status,"pendente");
  const card=await api("/pagamentos/cartao","POST",{aluguel_id:r.id,tokenCartao:"demo"},renterCookie,{"Idempotency-Key":"switch-card"});assert.equal(card.status,200);assert.equal(card.data.metodo,"cartao");assert.notEqual(card.data.id,pix.data.id);
  assert.equal((await prisma.pagamentos.findUniqueOrThrow({where:{id:pix.data.id}})).status,"cancelado");assert.equal(card.data.status,"pago");
  await prisma.pagamentos.update({where:{id:pix.data.id},data:{gateway:"simulado"}});
  assert.equal((await api(`/pagamentos/${pix.data.id}/simular`,"POST",{status:"pago"},renterCookie)).status,403);
  assert.equal((await api("/pagamentos/cartao","POST",{aluguel_id:r.id,tokenCartao:"demo"},renterCookie,{"Idempotency-Key":"switch-card"})).data.id,card.data.id);
  const {default:env}=await import("../../app/config/env.ts");const mode=env.PAYMENT_MODE;
  try{env.PAYMENT_MODE="gateway";assert.equal((await api(`/pagamentos/${card.data.id}/estornar`,"POST",{},renterCookie)).status,200);}finally{env.PAYMENT_MODE=mode;}
  const realRental=await approved();
  const real=await prisma.pagamentos.create({data:{aluguel_id:realRental.id,valor:12,metodo:"pix",gateway:"real",referencia:crypto.randomUUID()}});
  assert.equal((await api(`/pagamentos/${real.id}/simular`,"POST",{status:"pago"},renterCookie)).status,403);
  assert.equal((await api("/pagamentos/pix/confirmar","POST",{aluguel_id:realRental.id},renterCookie)).status,403);
  const originalFetch=globalThis.fetch;let calls=0;
  const oldUrl=process.env.PAYMENT_GATEWAY_URL,oldToken=process.env.PAYMENT_GATEWAY_TOKEN;
  process.env.PAYMENT_GATEWAY_URL="https://provider.test";process.env.PAYMENT_GATEWAY_TOKEN="test";
  globalThis.fetch=async(input,init)=>{if(String(input).startsWith("https://provider.test")){calls++;return new Response(JSON.stringify({referencia:real.referencia,status:"pendente"}),{status:200,headers:{"Content-Type":"application/json"}});}return originalFetch(input,init);};
  try {
   assert.equal((await api("/pagamentos/cartao","POST",{aluguel_id:realRental.id,tokenCartao:"demo"},renterCookie)).status,409);
   assert.equal((await prisma.pagamentos.findUniqueOrThrow({where:{id:real.id}})).status,"cancelamento_pendente");assert.equal(calls,1);
   assert.equal((await api(`/pagamentos/${real.id}/cancelar`,"POST",{},renterCookie)).status,202);
   assert.equal((await prisma.pagamentos.findUniqueOrThrow({where:{id:real.id}})).status,"cancelamento_pendente");
   assert.equal(await prisma.pagamentos.count({where:{aluguel_id:realRental.id}}),1);
   const {applyPayment}=await import("../../app/controllers/paymentsController.ts");
   await applyPayment(real.id,"cancelado");
   await prisma.alugueis.update({where:{id:realRental.id},data:{status:"pago"}});
   const paid=await prisma.pagamentos.create({data:{aluguel_id:realRental.id,valor:12,metodo:"cartao",status:"pago",gateway:"real",referencia:crypto.randomUUID()}});
   globalThis.fetch=async(input,init)=>{if(String(input).startsWith("https://provider.test"))throw new Error("timeout");return originalFetch(input,init);};
   assert.equal((await api(`/pagamentos/${paid.id}/estornar`,"POST",{},renterCookie)).status,502);
   globalThis.fetch=async(input,init)=>{if(String(input).startsWith("https://provider.test")){assert.equal((init?.headers as Record<string,string>)["Idempotency-Key"],`refund:${paid.id}`);return new Response(JSON.stringify({referencia:paid.referencia,status:"pendente"}),{status:200});}return originalFetch(input,init);};
   assert.equal((await prisma.pagamentos.findUniqueOrThrow({where:{id:paid.id}})).status,"estorno_pendente");
   assert.equal((await api(`/retiradas/${realRental.id}/fotos`,"POST",photos(),renterCookie)).status,409);
   assert.equal((await api(`/pagamentos/${paid.id}/simular`,"POST",{status:"cancelado"},renterCookie)).status,403);
   assert.equal((await api(`/pagamentos/${paid.id}/estornar`,"POST",{},renterCookie)).status,202);
   await applyPayment(paid.id,"estornado");await applyPayment(paid.id,"estornado");
   assert.equal(await prisma.eventos_aluguel.count({where:{aluguel_id:realRental.id,motivo:"Pagamento estornado"}}),1);
   const expiredRental=await approved();const expiredDay=new Date(new Date(Date.now()-2*86400000).toISOString().slice(0,10));await prisma.alugueis.update({where:{id:expiredRental.id},data:{data_inicio:expiredDay,data_fim:expiredDay,pagamento_ate:new Date(0)}});
   const expiredPayment=await prisma.pagamentos.create({data:{aluguel_id:expiredRental.id,valor:12,metodo:"pix",gateway:"real",referencia:crypto.randomUUID()}});
   let cancellations=0;
   globalThis.fetch=async(input,init)=>{if(String(input).startsWith("https://provider.test")){cancellations++;assert.equal((init?.headers as Record<string,string>)["Idempotency-Key"],`cancel:${expiredPayment.id}`);return new Response(JSON.stringify({referencia:expiredPayment.referencia,status:"cancelado"}),{status:200});}return originalFetch(input,init);};
   const {maintainRentals}=await import("../../app/services/rentalMaintenance.ts");
   await maintainRentals();assert.equal(cancellations,0);
   assert.equal((await prisma.pagamentos.findUniqueOrThrow({where:{id:expiredPayment.id}})).status,"cancelamento_pendente");
   await maintainRentals(true);await maintainRentals(true);assert.equal(cancellations,1);
   assert.equal((await prisma.pagamentos.findUniqueOrThrow({where:{id:expiredPayment.id}})).status,"cancelado");
  } finally {globalThis.fetch=originalFetch;if(oldUrl===undefined)delete process.env.PAYMENT_GATEWAY_URL;else process.env.PAYMENT_GATEWAY_URL=oldUrl;if(oldToken===undefined)delete process.env.PAYMENT_GATEWAY_TOKEN;else process.env.PAYMENT_GATEWAY_TOKEN=oldToken;}
 });
 await t.test("webhook estrutural, antecipado e recebimento após expiração persistidos",async()=>{
  const old=process.env.PAYMENT_WEBHOOK_SECRET;process.env.PAYMENT_WEBHOOK_SECRET="audit-secret";
  async function send(e:unknown){const raw=JSON.stringify(e);return (await fetch(base+"/pagamentos/webhook",{method:"POST",headers:{"Content-Type":"application/json","X-Webhook-Signature":crypto.createHmac("sha256","audit-secret").update(raw).digest("hex")},body:raw})).status;}
  try {
   assert.equal(await send(null),400);assert.equal(await send({}),422);assert.equal(await send({id:"x",referencia:"y",valor:12}),422);
   for(const valor of [null,"12",-1,0,12.123])assert.equal(await send({id:"invalid",referencia:"unknown",valor,status:"pago"}),422);
   const item=await prisma.itens.create({data:{usuario_id:ownerId,titulo:"Webhook antecipado",preco_por_dia:12,valor_mercado:300}});
   const r=await prisma.alugueis.create({data:{item_id:item.id,locador_id:ownerId,locatario_id:renterId,data_inicio:new Date(today),data_fim:new Date(today),valor_total:12,status:"cancelado"}});
   const p=await prisma.pagamentos.create({data:{aluguel_id:r.id,valor:12,gateway:"real",status:"cancelado",metodo:"pix"}});
   const e={id:crypto.randomUUID(),referencia:crypto.randomUUID(),valor:12,status:"pago"};
   assert.equal(await send(e),202);assert.equal(await send(e),202);
   assert.equal((await prisma.webhook_eventos.findUniqueOrThrow({where:{id:e.id}})).processado_em,null);
   await prisma.pagamentos.update({where:{id:p.id},data:{referencia:e.referencia}});
   const {reconcilePaymentWebhooks}=await import("../../app/controllers/paymentsController.ts");await reconcilePaymentWebhooks();await reconcilePaymentWebhooks();
   assert.equal((await prisma.pagamentos.findUniqueOrThrow({where:{id:p.id}})).status,"pago");
   assert.equal((await prisma.alugueis.findUniqueOrThrow({where:{id:r.id}})).status,"cancelado");assert.equal(await prisma.conciliacoes_pagamento.count({where:{pagamento_id:p.id}}),1);
   assert.equal(await send(e),200);assert.equal(await send({...e,status:"cancelado"}),409);
   assert.equal((await api(`/retiradas/${r.id}/fotos`,"POST",photos(),renterCookie)).status,409);
   const replacedItem=await prisma.itens.create({data:{usuario_id:ownerId,titulo:"Recebimento da cobrança anterior",preco_por_dia:12,valor_mercado:300}});
   const activeRental=await prisma.alugueis.create({data:{item_id:replacedItem.id,locador_id:ownerId,locatario_id:renterId,data_inicio:new Date(today),data_fim:new Date(today),valor_total:12,status:"aprovado",pagamento_ate:new Date(Date.now()+60000)}});
   const canceled=await prisma.pagamentos.create({data:{aluguel_id:activeRental.id,valor:12,gateway:"real",status:"cancelado",referencia:crypto.randomUUID()}});
   await prisma.pagamentos.create({data:{aluguel_id:activeRental.id,valor:12,gateway:"real",status:"pendente",referencia:crypto.randomUUID()}});
   assert.equal(await send({id:crypto.randomUUID(),referencia:canceled.referencia,valor:12,status:"pago"}),200);
   assert.equal((await prisma.pagamentos.findUniqueOrThrow({where:{id:canceled.id}})).status,"conciliacao");
   assert.equal((await prisma.alugueis.findUniqueOrThrow({where:{id:activeRental.id}})).status,"aprovado");
   assert.equal(await prisma.conciliacoes_pagamento.count({where:{pagamento_id:canceled.id}}),1);
  }finally{if(old===undefined)delete process.env.PAYMENT_WEBHOOK_SECRET;else process.env.PAYMENT_WEBHOOK_SECRET=old;}
 });
 await t.test("conversas distinguem anúncio A, anúncio B e contexto null",async()=>{
  const second=await prisma.itens.create({data:{usuario_id:ownerId,titulo:"Conversa B",preco_por_dia:1,valor_mercado:30}});
  const a=await api("/conversations","POST",{userId:ownerId,produtoId:itemId},renterCookie);
  const general=await api("/conversations","POST",{userId:ownerId},renterCookie);
  const b=await api("/conversations","POST",{userId:ownerId,produtoId:second.id},renterCookie);
  assert.equal(new Set([a.data.id,general.data.id,b.data.id]).size,3);
  assert.equal((await api("/conversations","POST",{userId:renterId},ownerCookie)).data.id,general.data.id);
 });
 await t.test("fotos legadas: alterações restauram 1–5 e IDs duplicados não contam",async()=>{
  const item=await prisma.itens.create({data:{usuario_id:ownerId,titulo:"Fotos legadas",preco_por_dia:1,valor_mercado:30}});
  const url=`/objetos/${item.id}`;
  assert.equal((await api(url,"PATCH",{titulo:"Legado sem fotos"},ownerCookie)).status,200);
  assert.equal((await api(url,"PATCH",{fotos_mantidas:[]},ownerCookie)).status,422);
  assert.equal((await api(url,"PATCH",{foto_principal_index:0},ownerCookie)).status,422);
  const added=await api(url,"PATCH",photos(),ownerCookie);assert.equal(added.status,200);
  const first=added.data.fotos[0].id;
  assert.equal((await api(url,"PATCH",{fotos_mantidas:[first,first]},ownerCookie)).status,422);
  await prisma.fotos_item.createMany({data:Array.from({length:5},()=>({item_id:item.id,url:"/uploads/items/legacy.png"}))});
  assert.equal((await api(url,"PATCH",photos(),ownerCookie)).status,422);
  assert.equal((await api(url,"PATCH",{foto_principal_index:0},ownerCookie)).status,422);
  const fixed=await api(url,"PATCH",{fotos_mantidas:[first]},ownerCookie);assert.equal(fixed.status,200);assert.equal(fixed.data.fotos.length,1);
 });
 await t.test("reservas futuras sem sobreposição; atraso real impede nova reserva",async()=>{
  const item=await prisma.itens.create({data:{usuario_id:ownerId,titulo:"Reserva futura",preco_por_dia:1,valor_mercado:30}});
  const current=await prisma.alugueis.create({data:{item_id:item.id,locador_id:ownerId,locatario_id:renterId,data_inicio:new Date(today),data_fim:new Date(today),valor_total:1,status:"retirado"}});
  const future=new Date(Date.now()+10*86400000).toISOString().slice(0,10);
  const request={objeto_id:item.id,data_retirada:future,data_devolucao:future};
  const next=await api("/solicitacoes","POST",request,strangerCookie);assert.equal(next.status,201,JSON.stringify(next));
  assert.equal((await api("/solicitacoes","POST",request,strangerCookie)).status,409);
  await api(`/solicitacoes/${next.data.id}`,"PATCH",{status:"cancelado"},strangerCookie);
  const past=new Date(Date.now()-2*86400000);await prisma.alugueis.update({where:{id:current.id},data:{data_inicio:past,data_fim:past}});
  assert.equal((await api("/solicitacoes","POST",request,strangerCookie)).status,409);
  await prisma.alugueis.update({where:{id:current.id},data:{status:"devolvido"}});
  const restored=await api("/solicitacoes","POST",request,strangerCookie);assert.equal(restored.status,201);
  assert.equal((await api(`/solicitacoes/${restored.data.id}`,"PATCH",{status:"cancelado"},strangerCookie)).status,200);
 });
 await t.test("manutenção não deixa atrasos além dos primeiros 100 e é idempotente",async()=>{
  const items=Array.from({length:121},()=>({id:crypto.randomUUID(),usuario_id:ownerId,titulo:"Manutenção",preco_por_dia:1,valor_mercado:30}));await prisma.itens.createMany({data:items});
  const past=new Date(Date.now()-3*86400000);
  const rentals=items.map(i=>({id:crypto.randomUUID(),item_id:i.id,locador_id:ownerId,locatario_id:renterId,data_inicio:past,data_fim:past,valor_total:1,status:"retirado"}));await prisma.alugueis.createMany({data:rentals});
  const ids=rentals.map(r=>r.id);const {maintainRentals}=await import("../../app/services/rentalMaintenance.ts");
  await maintainRentals();await maintainRentals();await maintainRentals();
  assert.equal(await prisma.alugueis.count({where:{id:{in:ids},atraso_notificado:"devolucao"}}),121);
  const notices=await prisma.notificacoes.findMany({where:{tipo:"bloqueio_conta"}});assert.equal(notices.filter(n=>ids.includes((n.contexto as any).aluguelId)).length,242);
  await prisma.alugueis.updateMany({where:{id:{in:ids}},data:{status:"devolvido"}});
 });
 await t.test("Permissions-Policy permite geo nas origens configuradas e mantém câmera bloqueada",async()=>{
  const response=await fetch(base+"/categorias");const policy=response.headers.get("permissions-policy")!;
  assert.ok(policy.includes("geolocation=(self "));assert.ok(policy.includes("camera=()"));assert.ok(policy.includes("microphone=()"));
  const {default:env}=await import("../../app/config/env.ts");for(const origin of env.FRONTEND_ORIGINS)assert.ok(policy.includes(JSON.stringify(origin)));
 });
 await t.test("upload falso, campos HTML e webhook sem assinatura são rejeitados",async()=>{
  const form=new FormData();form.append("file",new Blob(["<script>alert(1)</script>"],{type:"image/png"}),"foto.png");
  assert.equal((await api("/uploads","POST",form,renterCookie)).status,422);
  assert.equal((await api("/usuarios/perfil","PATCH",{nome:"<img src=x onerror=alert(1)>"},renterCookie)).status,422);
  assert.equal((await api("/pagamentos/webhook","POST",{id:"falso",referencia:paymentId,valor:12,status:"pago"})).status,401);
  const response=await fetch(base+"/usuarios/me",{headers:{Origin:"https://malicioso.invalid",Cookie:renterCookie}});assert.equal(response.status,403);
 });
 await t.test("recuperação por token expira, invalida sessões e impede reutilização",async()=>{
  const user=await prisma.usuarios.findUniqueOrThrow({where:{cpf:stranger.cpf}});
  const raw=crypto.randomBytes(32).toString("hex");const hash=crypto.createHash("sha256").update(raw).digest("hex");
  await prisma.resetar_Senha.create({data:{userId:user.id,token:hash,expire_in:new Date(Date.now()+60000)}});
  assert.equal((await api("/contas/resetar-senha","POST",{token:raw,senha:"recuperada123"})).status,200);
  assert.equal((await api("/usuarios/me","GET",undefined,strangerCookie)).status,401);
  assert.equal((await api("/contas/resetar-senha","POST",{token:raw,senha:"recuperada123"})).status,400);
  strangerCookie=(await api("/login","POST",{cpf:stranger.cpf,senha:"recuperada123"})).cookie;
  const expired=crypto.randomBytes(32).toString("hex");await prisma.resetar_Senha.create({data:{userId:user.id,token:crypto.createHash("sha256").update(expired).digest("hex"),expire_in:new Date(0)}});
  assert.equal((await api("/contas/resetar-senha","POST",{token:expired,senha:"recuperada123"})).status,400);
 });

 await t.test("avatar, endereço privado e simulação bloqueada no modo real",async()=>{
  assert.equal((await api("/usuarios/avatar","POST",photos({},["avatar"]),renterCookie)).status,200);
  assert.equal((await api("/usuarios/avatar","DELETE",undefined,renterCookie)).status,200);
  assert.equal((await api("/usuarios/me","GET",undefined,renterCookie)).data.avatarUrl,null);
  const addresses=(await api("/enderecos","GET",undefined,adminCookie)).data;
  assert.equal((await api(`/enderecos/${addresses[0].id}`,"GET",undefined,renterCookie)).status,404);
  const {default:env}=await import("../../app/config/env.ts");const previous=env.PAYMENT_MODE;
  try{env.PAYMENT_MODE="gateway";assert.equal((await api("/pagamentos/pix/confirmar","POST",{aluguel_id:rentalId},renterCookie)).status,403);}
  finally{env.PAYMENT_MODE=previous;}
 });
 await t.test("coleções pessoais permitem navegar além de 100 registros",async()=>{
  await prisma.notificacoes.createMany({data:Array.from({length:105},(_,i)=>({usuario_id:renterId,tipo:"teste",titulo:`Notificação ${i}`,mensagem:"Teste"}))});
  const conv=Array.from({length:105},()=>({id:crypto.randomUUID(),chave:`page:${crypto.randomUUID()}`}));await prisma.conversas.createMany({data:conv});
  await prisma.participantes_conversa.createMany({data:conv.flatMap(row=>[{conversa_id:row.id,usuario_id:ownerId},{conversa_id:row.id,usuario_id:renterId}])});
  await prisma.suportes.createMany({data:Array.from({length:105},(_,i)=>({usuario_id:renterId,assunto:`Paginado ${i}`,mensagem:"Teste",protocolo:`PAGE-${crypto.randomUUID()}`}))});
  const read=async(path:string,cookie:string)=>{const response=await fetch(base+path,{headers:{Cookie:cookie}});return {status:response.status,total:Number(response.headers.get("x-total-count")),data:await response.json() as any};};
  for(const path of ["/notificacoes","/conversations"]){const first=await read(`${path}?page=1&limit=100`,renterCookie),second=await read(`${path}?page=2&limit=100`,renterCookie);assert.equal(first.status,200);assert.equal(first.data.length,100);assert.ok(second.data.length>=5);assert.ok(first.total>=105);assert.notEqual(first.data[0].id,second.data[0].id);}
  const own=await read("/objetos/meus?page=2&limit=100",adminCookie);assert.ok(own.total>100);assert.ok(own.data.length>0);
  const history=await read("/alugueis/historico?page=2&limit=100",adminCookie);assert.ok(history.total>100);assert.ok(history.data.length>0);
  const support=await read("/suporte/me?page=2&limit=100",renterCookie);assert.ok(support.data.paginacao.totais.suporte>=105);assert.ok(support.data.suporte.length>=5);
 });
 await t.test("exclusão autentica senha e revoga acesso",async()=>{
  assert.equal((await api("/usuarios/me","DELETE",{senha:"incorreta"},strangerCookie)).status,401);
  assert.equal((await api("/usuarios/me","DELETE",{senha:"recuperada123"},strangerCookie)).status,200);
  assert.equal((await api("/usuarios/me","GET",undefined,strangerCookie)).status,401);
 });
 await t.test("alterar senha e logout invalidam sessão",async()=>{
  assert.equal((await api("/usuarios/senha","PUT",{senhaAtual:renter.senha,senhaNova:"novaSenha123"},renterCookie)).status,200);
  assert.equal((await api("/login/sessao","GET",undefined,renterCookie)).status,401);
  renterCookie=(await api("/login","POST",{cpf:renter.cpf,senha:"novaSenha123"})).cookie;
  assert.equal((await api("/login/logout","POST",{},renterCookie)).status,200);assert.equal((await api("/usuarios/me","GET",undefined,renterCookie)).status,401);
 });
});
