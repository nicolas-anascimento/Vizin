// Valida utilitários e DTOs isolados que sustentam o contrato público da API.
import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import vm from "node:vm";
import { cpf, password, slug, uuid } from "../app/utils/validation.ts";
import { authorizeTransition, normalizeRentalStatus } from "../app/services/rentalRules.ts";
import { serializeItem, serializePayment, serializeProfile, serializePublicPayment } from "../app/utils/serializers.ts";
import { parseDateOnly, rentalDays } from "../app/utils/dates.ts";

test("redirect pós autenticação usa o tipo devolvido pelo backend", async()=>{
 const source=await readFile(new URL("../../../frontend/usuario/Login/api.js",import.meta.url),"utf8");
 const context=vm.createContext({});
 new vm.Script(source).runInContext(context);
 assert.equal(vm.runInContext("destinoAposAutenticacao({ tipo: 'admin' })",context),"/admin");
 assert.equal(vm.runInContext("destinoAposAutenticacao({ tipo: 'usuario' })",context),"/inicio");
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
