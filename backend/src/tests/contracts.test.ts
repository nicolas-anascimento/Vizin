// Valida utilitários e DTOs isolados que sustentam o contrato público da API.
import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import vm from "node:vm";
import { cpf, password, slug, uuid } from "../app/utils/validation.ts";
import { authorizeTransition, normalizeRentalStatus } from "../app/services/rentalRules.ts";
import { serializeItem, serializePayment, serializeProfile, serializePublicPayment } from "../app/utils/serializers.ts";
import { parseDateOnly, rentalDays } from "../app/utils/dates.ts";
import { SYSTEM_OCCURRENCE_REASONS, userReportWhere } from "../app/services/reportRules.ts";
import { subscriptionDto } from "../app/services/subscriptionService.ts";

test("planos, assinatura e administração usam as rotas efetivamente registradas", async () => {
 const read = (path: string) => readFile(new URL(path, import.meta.url), "utf8");
 const [client, routes, adminRoutes, apiRoutes, app, profile] = await Promise.all([
  read("../../../frontend/usuario/utils/assinaturas-api.js"), read("../app/routes/subscriptions.ts"),
  read("../app/routes/admin.ts"), read("../app/routes/api.ts"), read("../app.ts"),
  read("../../../frontend/usuario/Perfil/perfil.js"),
 ]);
 for (const route of ["/planos", "/usuarios/me/assinatura", "/usuarios/me/publicacoes", "/assinaturas", "/assinaturas/:id", "/assinaturas/:id/cancelar", "/pagamentos-assinatura/:id"]) assert.ok(routes.includes(`"${route}"`), route);
 for (const call of ["/planos", "/usuarios/me/assinatura", "/usuarios/me/publicacoes", "/assinaturas", "/pagamentos-assinatura/"]) assert.ok(client.includes(call), call);
 assert.match(apiRoutes, /router\.use\(subscriptions\)/);
 assert.match(app, /"\/api\/assinaturas\/webhook"/);
 assert.match(adminRoutes, /"\/usuarios\/:id\/assinatura"/);
 assert.match(adminRoutes, /"\/pagamentos\/estatisticas"/);
 assert.doesNotMatch(profile, /AssinaturasAPI\.cancelar\(/);
});

test("DTO de assinatura conserva cota calculada e período do servidor", () => {
 const start = new Date("2026-11-01T00:00:00.000Z"), end = new Date("2026-12-01T00:00:00.000Z");
 const dto = subscriptionDto({ plano: { id: "plan-id", codigo: "gratuito", nome: "Gratuito", preco_centavos: 0, limite_publicacoes: 1, ativo: true } as any, assinatura: null, periodo: { inicio: start, fim: end }, utilizadas: 1, disponiveis: 0 });
 assert.equal(dto.plano.codigo, "gratuito"); assert.equal(dto.anuncios_usados, dto.publicacoes.utilizadas);
 assert.equal(dto.publicacoes.disponiveis, 0); assert.equal(dto.publicacoes.periodo_inicio, start);
 assert.equal(dto.assinatura.status, "gratuita");
});

test("redirect pós autenticação usa o tipo devolvido pelo backend", async()=>{
 const source=await readFile(new URL("../../../frontend/usuario/Login/api.js",import.meta.url),"utf8");
 const context=vm.createContext({ URLSearchParams, window: { location: { search: "" } } });
 new vm.Script(source).runInContext(context);
 assert.equal(vm.runInContext("destinoAposAutenticacao({ tipo: 'admin' })",context),"/admin/inicio");
 assert.equal(vm.runInContext("destinoAposAutenticacao({ tipo: 'usuario' })",context),"/home");
 context.window.location.search = "?plano=intermediario";
 assert.equal(vm.runInContext("destinoAposAutenticacao({ tipo: 'usuario' })",context),"/finalizar-pagamento?plano=intermediario");
 context.window.location.search = "?plano=avancado";
 assert.equal(vm.runInContext("destinoAposAutenticacao({ tipo: 'usuario' })",context),"/finalizar-pagamento?plano=avancado");
 assert.equal(vm.runInContext("destinoAposAutenticacao({ tipo: 'admin' })",context),"/admin/inicio");
 context.window.location.search = "?plano=https://outro.exemplo";
 assert.equal(vm.runInContext("destinoAposAutenticacao({ tipo: 'usuario' })",context),"/home");
 context.window.location.search = "?next=https%3A%2F%2Foutro.exemplo";
 assert.equal(vm.runInContext("destinoAposAutenticacao({ tipo: 'usuario' })",context),"/home");
 context.window.location.search = "?next=%2Fsuporte";
 assert.equal(vm.runInContext("destinoAposAutenticacao({ tipo: 'usuario' })",context),"/suporte");
 context.window.location.search = "?next=https%3A%2F%2Foutro.exemplo&plano=avancado";
 assert.equal(vm.runInContext("destinoAposAutenticacao({ tipo: 'usuario' })",context),"/finalizar-pagamento?plano=avancado");
 const landing=await readFile(new URL("../../../frontend/landing-page/index.html",import.meta.url),"utf8");
 assert.match(landing,/href="\/cadastro\?plano=intermediario"/);
 assert.match(landing,/href="\/cadastro\?plano=avancado"/);
});

test("página de confirmação utiliza o endpoint correto e oculta o token", async () => {
 const source=await readFile(new URL("../../../frontend/usuario/Confirmar-email/confirmar-email.js",import.meta.url),"utf8");
 async function run(search: string, status=200) {
  const calls: Array<{url:string, options:any}>=[];
  const message={textContent:""};
  let replaced="";
  const context=vm.createContext({
   URLSearchParams,
   document:{getElementById:()=>message},
   window:{location:{search,pathname:"/confirmar-email"},history:{replaceState:(_a:any,_b:any,url:string)=>{replaced=url;}}},
   fetch:async(url:string,options:any)=>{calls.push({url,options});return {ok:status===200};},
  });
  new vm.Script(source).runInContext(context);
  await new Promise(resolve=>setTimeout(resolve,0));
  return {calls,message,replaced};
 }
 const token="a".repeat(64);
 const initial=await run(`?token=${token}`);
 assert.equal(initial.calls[0]?.url,"/api/usuarios/email/verificar");
 assert.equal(JSON.parse(initial.calls[0]!.options.body).token,token);
 assert.equal(initial.replaced,"/confirmar-email");
 const changed=await run(`?tipo=alteracao&token=${token}`);
 assert.equal(changed.calls[0]?.url,"/api/usuarios/email/confirmar");
 assert.equal(changed.calls[0]?.options.method,"POST");
 assert.equal((await run("?tipo=alteracao&token=ruim")).calls.length,0);
 assert.match((await run(`?tipo=alteracao&token=${token}`,400)).message.textContent,/inválido/);
});
test("frontend admin usa contratos canônicos de usuário e objeto", async()=>{
 const userApi=await readFile(new URL("../../../frontend/admin/Usuarios/admin-api.js",import.meta.url),"utf8");
 const itemApi=await readFile(new URL("../../../frontend/admin/Anuncios/admin-api.js",import.meta.url),"utf8");
 assert.match(userApi,/\/admin\/usuarios\/\$\{encodeURIComponent\(id\)\}/);
 assert.doesNotMatch(userApi,/while\s*\(true\)/);
 assert.match(itemApi,/\{ disponivel,/);
 assert.doesNotMatch(itemApi,/\{ status,/);
 assert.match(itemApi,/\/objetos\/\$\{encodeURIComponent\(id\)\}/);
});
test("campanhas e alertas administrativos usam namespaces distintos",async()=>{
 const routes=await readFile(new URL("../app/routes/admin.ts",import.meta.url),"utf8");
 const campaignClient=await readFile(new URL("../../../frontend/admin/Notificacoes/admin-notificacoes-api.js",import.meta.url),"utf8");
 assert.match(routes,/"\/comunicados"/);assert.match(routes,/"\/notificacoes"/);
 assert.match(campaignClient,/\/admin\/comunicados/);assert.doesNotMatch(campaignClient,/apiRequest\(`?\/admin\/notificacoes/);
 assert.ok(routes.indexOf('"/notificacoes/resumo"')<routes.indexOf('"/notificacoes/:id"'));
});
test("conta suspensa mantém somente sessão, perfil, suporte e notificações",async()=>{
 const auth=await readFile(new URL("../app/middlewares/auth.ts",import.meta.url),"utf8");
 const socket=await readFile(new URL("../realtime/chatSocket.ts",import.meta.url),"utf8");
 assert.match(auth,/codigo: "conta_suspensa"/);assert.match(auth,/\/api\/suporte\/ajuda/);assert.match(auth,/\/api\/login\/sessao/);assert.match(socket,/assertActive/);
});
test("rotas limpas e sessão por cookie não dependem do cache local", async()=>{
 const web=await readFile(new URL("../app/routes/web.ts",import.meta.url),"utf8");
 assert.match(web,/"\/alterar-senha": userPage\("Alterar-senha"\)/);
 assert.doesNotMatch(web,/Forma-de pagamento|Alterar-senha\.js/);
 const files=["Perfil/perfil.js","Inicio/script.js","Produto/produto.js","Historico/historico.js","Mensagens/app.js","Notificacoes/notificacoes.js"];
 for(const file of files){
  const source=await readFile(new URL(`../../../frontend/usuario/${file}`,import.meta.url),"utf8");
  assert.doesNotMatch(source,/if\s*\(\s*!localStorage\.getItem\(["']token["']\)\s*\)/,file);
 }
});
test("chat reconecta, reentra na room e sincroniza o histórico REST",async()=>{
 const source=await readFile(new URL("../../../frontend/usuario/Mensagens/app.js",import.meta.url),"utf8");
 assert.match(source,/realtimeSocket\.emit\("chat:join"/);
 assert.match(source,/synchronizeAfterReconnect/);
 assert.match(source,/await API\.getMessages\(conversationId\)/);
 assert.match(source,/client_message_id/);
});
test("checkout PIX preserva a chave em retry e confirma por pagamento do backend",async()=>{
 const source=await readFile(new URL("../../../frontend/usuario/utils/checkout-shared.js",import.meta.url),"utf8");
 assert.match(source,/sessionStorage\.getItem\(chaveStorage\(\)\)/);
 assert.match(source,/API\.contratar\(cfg\.planoCodigo, "pix", chavePix\)/);
 assert.match(source,/API\.obterPagamento\(pagamentoId\)/);
 assert.match(source,/API\.ehPago\(final\)/);
 const confirmation=await readFile(new URL("../../../frontend/usuario/Pagamento-confirmado/pagamento-confirmado.js",import.meta.url),"utf8");
 assert.match(confirmation,/URLSearchParams\(window\.location\.search\)\.get\("pagamentoId"\)/);
 assert.match(confirmation,/AssinaturasAPI\.obterPagamento\(pagamentoId\)/);
 assert.match(confirmation,/AssinaturasAPI\.obterMinhaAssinatura\(\)/);
});
test("rotas de aluguel descontinuam cobrança e planos usam namespace próprio",async()=>{
 const rentals=await readFile(new URL("../app/routes/rentals.ts",import.meta.url),"utf8");
 const payments=await readFile(new URL("../app/routes/payments.ts",import.meta.url),"utf8");
 const subscriptions=await readFile(new URL("../app/routes/subscriptions.ts",import.meta.url),"utf8");
 assert.match(rentals,/rota_financeira_descontinuada/);
 assert.doesNotMatch(rentals,/createContractPayment|createDemoPayment/);
 assert.match(payments,/status\(410\)/);
 for(const route of ["/planos","/usuarios/me/assinatura","/usuarios/me/publicacoes","/assinaturas"])assert.match(subscriptions,new RegExp(route.replaceAll("/","\\/")));
});
test("frontend de aluguel não envia usuário para checkout financeiro",async()=>{
 const product=await readFile(new URL("../../../frontend/usuario/Produto/produto.js",import.meta.url),"utf8");
 const history=await readFile(new URL("../../../frontend/usuario/Historico/historico.js",import.meta.url),"utf8");
 assert.doesNotMatch(product,/window\.location\.href\s*=\s*`\/finalizar-pagamento\?/);
 assert.doesNotMatch(history,/href="\/finalizar-pagamento\?/);
});
test("produtores opcionais consultam a política de preferências antes de notificar",async()=>{
 const files=[
  "app/services/chatService.ts",
  "app/controllers/messagesController.ts",
  "app/controllers/reviewsController.ts",
  "app/controllers/rentalsController.ts",
  "app/services/rentalMaintenance.ts",
 ];
 for(const file of files){
  const source=await readFile(new URL(`../${file}`,import.meta.url),"utf8");
  assert.match(source,/createNotification(?:s)?\(/,file);
 }
 const realtime=await readFile(new URL("../realtime/realtimeService.ts",import.meta.url),"utf8");
 assert.match(realtime,/if\s*\(result\.notification\)[\s\S]*notification:new/);
});
test("tela de preferências aguarda o backend e restaura o switch quando salvar falha",async()=>{
 const html=await readFile(new URL("../../../frontend/usuario/Preferencias/index.html",import.meta.url),"utf8");
 const script=await readFile(new URL("../../../frontend/usuario/Preferencias/preferencias.js",import.meta.url),"utf8");
 assert.equal((html.match(/data-pref="[^"]+" disabled/g)??[]).length,6);
 assert.match(script,/prefsAtuais\s*=\s*await[\s\S]*carregarPreferencias/);
 assert.match(script,/salvarPreferencias\(\{ \[chave\]: valorNovo \}\)/);
 assert.match(script,/toggle\.checked\s*=\s*valorAnterior/);
 assert.doesNotMatch(script,/localStorage|sessionStorage/);
});
test("CPF formatado é normalizado e dígitos inválidos são rejeitados",()=>{
 assert.equal(cpf("529.982.247-25"),"52998224725");
 for(const invalid of [undefined,"","11111111111","52998224724","123","abc52998224725"]) assert.throws(()=>cpf(invalid));
});
test("senha respeita limite bcrypt sem truncar bytes",()=>{assert.equal(password("senha123"),"senha123");assert.throws(()=>password("a1".repeat(40)));});
test("categorias equivalentes produzem slug único",()=>{assert.equal(slug("Eletrônicos"),slug("ELETRONICOS"));assert.equal(slug("  CASA E JÁRDIM  "),"casajardim");});
test("UUID permanece string nos contratos",()=>{
 const id="b1977890-226b-41cd-aa1a-938e465e49be"; assert.equal(uuid(id),id); assert.throws(()=>uuid(1));
 assert.equal(serializeItem({id,titulo:"Objeto",preco_por_dia:"12.50"}).id,id);
 assert.equal(serializePayment({id,valor:"12.50"}).valor,12.5);
 const profile=serializeProfile({id,nome:"Pessoa",cpf:"52998224725",senha_hash:"secret"}); assert.equal(profile.cpf,undefined);assert.equal(profile.senha_hash,undefined);
});
test("DTO financeiro seleciona campos 3DS sem payload adicional",()=>{
 const p={id:"b1977890-226b-41cd-aa1a-938e465e49be",aluguel_id:"b1977890-226b-41cd-aa1a-938e465e49be",valor:"12.50",status:"pendente",metodo:"cartao",gateway:"mercado_pago",dados:{provider_secret:"segredo",acao_necessaria:{tipo:"3ds",url:"https://example.com/3ds",creq:"desafio",token:"segredo"}}};
 for(const dto of [serializePayment(p),serializePublicPayment(p)]){
  assert.equal(JSON.stringify(dto).includes("segredo"),false);
  assert.deepEqual(dto.acao_necessaria,{tipo:"3ds",url:"https://example.com/3ds",creq:"desafio"});
 }
});
test("aluguel no mesmo dia é permitido, período invertido e data inexistente são rejeitados",()=>{
 const date=parseDateOnly("2026-10-01");assert.equal(rentalDays(date,date),1);assert.throws(()=>parseDateOnly("2026-02-30"));assert.throws(()=>rentalDays(date,parseDateOnly("2026-09-30")));
});
test("transições exigem participante e papel correto e não permitem pular fotos",()=>{
 const r={status:"pendente",locador_id:"owner",locatario_id:"renter"};
 authorizeTransition(r,{id:"owner",tipo:"usuario"},"aprovado");
 assert.throws(()=>authorizeTransition(r,{id:"renter",tipo:"usuario"},"aprovado"));
 assert.throws(()=>authorizeTransition(r,{id:"stranger",tipo:"usuario"},"cancelado"));
 assert.throws(()=>authorizeTransition({...r,status:"retirado"},{id:"owner",tipo:"usuario"},"devolvido"));
 assert.equal(normalizeRentalStatus("rejeitado"),"recusado");assert.equal(normalizeRentalStatus("concluido"),"finalizado");
});

test("uploads rejeitam truncamento e assinaturas isoladas, mantendo PNG legítimo",async()=>{
 const {validFileStructure}=await import("../app/utils/fileStructure.ts");
 const png=Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+ip1sAAAAASUVORK5CYII=","base64");
 assert.equal(validFileStructure(png,"image/png"),true);
 for(let i=0;i<png.length;i++)assert.equal(validFileStructure(png.subarray(0,i),"image/png"),false);
 for(const [mime,content]of [["image/jpeg",Buffer.from([255,216,255])],["image/gif",Buffer.from("GIF89a")],["image/webp",Buffer.from("RIFF0000WEBP")],["application/pdf",Buffer.from("%PDF-1.7")],["video/mp4",Buffer.from("0000ftyp")],["video/webm",Buffer.from([26,69,223,163])],["application/msword",Buffer.from([208,207,17,224,161,177,26,225])],["application/vnd.openxmlformats-officedocument.wordprocessingml.document",Buffer.from("PK\\x03\\x04word/")]] as const)assert.equal(validFileStructure(content,mime),false);
});

test("decodifica imagens legítimas JPG/PNG/GIF/WEBP e rejeita truncamento",async()=>{
 const {default:sharp}=await import("sharp");const {validFileContent}=await import("../app/utils/fileStructure.ts");
 for(const format of ["jpeg","png","gif","webp"] as const) {
  const bytes=await sharp({create:{width:4,height:4,channels:3,background:"red"}}).toFormat(format).toBuffer();
  assert.equal(await validFileContent(bytes,`image/${format}`),true,format);
  assert.equal(await validFileContent(bytes.subarray(0,bytes.length-5),`image/${format}`),false,format);
 }
});

test("estruturas legítimas PDF/DOCX/MP4/WEBM são aceitas e truncamento é rejeitado",async()=>{
 const {readFile}=await import("node:fs/promises");const {validFileStructure}=await import("../app/utils/fileStructure.ts");
 for(const [extension,mime] of [["pdf","application/pdf"],["docx","application/vnd.openxmlformats-officedocument.wordprocessingml.document"],["mp4","video/mp4"],["webm","video/webm"]] as const) {
  const bytes=await readFile(new URL(`./fixtures/valid.${extension}`,import.meta.url));
  assert.equal(validFileStructure(bytes,mime!),true,extension);
  assert.equal(validFileStructure(bytes.subarray(0,Math.floor(bytes.length/2)),mime!),false,extension);
 }
});


test("DTO de objeto expõe categoria estruturada, preços e proprietário público por UUID",()=>{
 const id="b1977890-226b-41cd-aa1a-938e465e49be";
 const dto=serializeItem({id,titulo:"Objeto",preco_por_dia:"25",usuario_id:id,categorias:{id,nome:"Ferramentas",slug:"ferramentas"},usuarios:{id,nome:"Pessoa",cpf:"privado",email:"privado",telefone:"privado"},enderecos:{rua:"privada",cidade:"São Paulo"},fotos_item:[{id,url:"/uploads/items/test.png",principal:true}]});
 assert.deepEqual(dto.categoria,{id,nome:"Ferramentas",slug:"ferramentas"});
 assert.equal(dto.preco,25);assert.equal(dto.preco_dia,25);assert.equal(dto.preco_por_dia,25);
 const owner=dto.proprietario as Record<string,unknown>;assert.equal(owner.id,id);assert.equal(owner.avatarUrl,null);
 for(const field of ["cpf","email","telefone","enderecos","rua"]) {assert.equal(dto[field],undefined);assert.equal(owner[field],undefined);}
 assert.deepEqual(dto.fotos,[{id,url:"/uploads/items/test.png",principal:true}]);
});
test("DTO público não expõe motivo de moderação e calcula flags de locação",()=>{
 const item={id:"b1977890-226b-41cd-aa1a-938e465e49be",titulo:"Objeto",preco_por_dia:10,oculto_pelo_admin:true,motivo_ocultacao:"Motivo interno",alugueis:[{status:"pendente"},{status:"retirado"}]};
 const publicDto=serializeItem(item),authorizedDto=serializeItem(item,true);
 assert.equal(Object.hasOwn(publicDto,"motivo_ocultacao"),false);
 assert.equal(authorizedDto.motivo_ocultacao,"Motivo interno");
 assert.equal(publicDto.em_locacao,true);assert.equal(publicDto.tem_solicitacao_pendente,true);
});
test("definição compartilhada de denúncia exclui ocorrências sistêmicas",()=>{
 assert.deepEqual(SYSTEM_OCCURRENCE_REASONS,["retirada_evidencia_unilateral"]);
 assert.deepEqual(userReportWhere({denunciado_id:"id"}),{denunciado_id:"id",motivo:{notIn:["retirada_evidencia_unilateral"]}});
});
