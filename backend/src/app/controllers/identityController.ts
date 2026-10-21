import path from "node:path";
import { readFile, unlink } from "node:fs/promises";
import type { RequestHandler } from "express";
import prisma from "../config/database.ts";
import { privateRoot } from "../middlewares/privateUpload.ts";
import { HttpError } from "../utils/httpError.ts";
import { text, uuid } from "../utils/validation.ts";
import { audit, pagination, statusFilter } from "../utils/admin.ts";
import { validFileContent } from "../utils/fileStructure.ts";
import { Prisma } from "../../generated/prisma/client.ts";
import { avatarUrl } from "../utils/files.ts";

function serialize(v: any) {
 const user=v?.usuarios;
 const { foto_url: storedAvatar, ...safeUser } = user ?? {};
 const serializedUser=user?{...safeUser,avatarUrl:avatarUrl(storedAvatar)}:null;
 return v ? {
  id:v.id,status:v.status,tipo_documento:v.tipo,tentativa:v.tentativa ?? undefined,
  revogada:v.revogada,motivo:v.motivo,criado_em:v.criado_em,
  decidido_em:v.analisado_em,decidido_por_nome:v.revisor?.nome ?? null,
  ...(user?{nome:user.nome,email:user.email,usuario_ativo:user.ativo,avatarUrl:serializedUser!.avatarUrl,usuario:serializedUser}:{}),
 } : {status:"nao_enviado"};
}
export const identityStatus: RequestHandler = async(req,res)=>{res.json(serialize(await prisma.verificacoes_identidade.findFirst({where:{usuario_id:req.user!.id},orderBy:{criado_em:"desc"}})));};
export const submitIdentity:RequestHandler=async(req,res)=>{
 // Compatibilidade com o formulário legado, que enviava as três imagens sem o campo.
 const kind=req.body?.tipo_documento===undefined?"rg":text(req.body.tipo_documento,"Tipo de documento",20);
 if(!["rg","cnh","passaporte"].includes(kind))throw new HttpError(422,"Tipo de documento inválido");
 const files=req.files as Record<string,Express.Multer.File[]>;const front=files?.documentoFrente?.[0],back=files?.documentoVerso?.[0],selfie=files?.selfie?.[0];
 if(!front||!selfie||(kind!=="passaporte"&&!back)||(kind==="passaporte"&&!!back))throw new HttpError(422,kind==="passaporte"?"Envie documento e selfie, sem verso":"Envie frente, verso e selfie");
 const documentos={documentoFrente:path.basename(front.path),...(back?{documentoVerso:path.basename(back.path)}:{}),selfie:path.basename(selfie.path)};
 const result=await prisma.$transaction(async tx=>{await tx.$queryRaw`SELECT id FROM usuarios WHERE id=${req.user!.id}::uuid FOR UPDATE`;if(await tx.verificacoes_identidade.count({where:{usuario_id:req.user!.id,status:{in:["pendente","aprovado"]}}}))throw new HttpError(409,"Verificação já aprovada ou em análise");const previous=await tx.verificacoes_identidade.count({where:{usuario_id:req.user!.id}});const row=await tx.verificacoes_identidade.create({data:{usuario_id:req.user!.id,documentos,tipo:kind,status:"pendente"}});await tx.notificacoes_admin.create({data:{tipo:previous?"verificacao_reenviada":"verificacao_enviada",categoria:"verificacoes",prioridade:"normal",titulo:"Verificação recebida",mensagem:"Uma verificação de identidade aguarda análise.",referencia_tipo:"verificacao",referencia_id:row.id,chave_deduplicacao:`verificacao_enviada:${row.id}`}});return row;});
 res.status(201).json(serialize(result));
};
export const cancelIdentity:RequestHandler=async(req,res)=>{
 const current=await prisma.verificacoes_identidade.findFirst({where:{usuario_id:req.user!.id,status:"pendente"},orderBy:{criado_em:"desc"}});if(!current)throw new HttpError(409,"Não há verificação pendente para cancelar","verificacao_nao_pendente");
 const changed=await prisma.verificacoes_identidade.updateMany({where:{id:current.id,status:"pendente"},data:{status:"cancelado",cancelado_em:new Date()}});if(!changed.count)throw new HttpError(409,"A verificação já foi analisada");
 await prisma.notificacoes_admin.create({data:{tipo:"verificacao_cancelada",categoria:"verificacoes",prioridade:"normal",titulo:"Verificação cancelada",mensagem:"Um usuário cancelou uma verificação pendente.",referencia_tipo:"verificacao",referencia_id:current.id,chave_deduplicacao:`verificacao_cancelada:${current.id}`}});
 await Promise.all(Object.values(current.documentos as Record<string,string>).map(file=>unlink(path.join(privateRoot,path.basename(file))).catch(()=>undefined)));
 res.json({success:true,status:"cancelado"});
};
export const listIdentities:RequestHandler=async(req,res)=>{
 const{page,limit,skip}=pagination(req);
 const status=statusFilter(req,["pendente","aprovado","rejeitado","cancelado"]);
 const search=typeof req.query.busca==="string"&&req.query.busca.trim()?text(req.query.busca,"Busca",100):undefined;
 const where={...(status?{status}:{}),...(search?{usuarios:{OR:[{nome:{contains:search,mode:"insensitive" as const}},{email:{contains:search,mode:"insensitive" as const}}]}}:{})};
 const[rows,total]=await Promise.all([
  prisma.verificacoes_identidade.findMany({where,orderBy:status==="pendente"?{criado_em:"asc"}:{criado_em:"desc"},skip,take:limit,include:{usuarios:{select:{id:true,nome:true,email:true,tipo:true,ativo:true,criado_em:true,foto_url:true}},revisor:{select:{nome:true}}}}),
  prisma.verificacoes_identidade.count({where}),
 ]);
 const ids=rows.map(row=>row.id);
 const attempts=ids.length?await prisma.$queryRaw<{id:string;tentativa:bigint}[]>(Prisma.sql`
  WITH ranked AS (
   SELECT id, ROW_NUMBER() OVER (PARTITION BY usuario_id ORDER BY criado_em ASC NULLS FIRST, id ASC) AS tentativa
   FROM verificacoes_identidade
  )
  SELECT id, tentativa FROM ranked WHERE id IN (${Prisma.join(ids)})
 `):[];
 const counts=new Map(attempts.map(row=>[row.id,Number(row.tentativa)]));
 res.json({dados:rows.map(v=>serialize({...v,tentativa:counts.get(v.id)??1})),total,pagina:page});
};
export const getIdentity:RequestHandler=async(req,res)=>{const id=uuid(req.params.id);const v=await prisma.verificacoes_identidade.findUnique({where:{id},include:{usuarios:{select:{id:true,nome:true,email:true,tipo:true,ativo:true,criado_em:true,foto_url:true}},revisor:{select:{nome:true}}}});if(!v)throw new HttpError(404,"Verificação não encontrada");const attempts=await prisma.$queryRaw<{tentativa:bigint}[]>`SELECT tentativa FROM (SELECT id,ROW_NUMBER() OVER (ORDER BY criado_em ASC NULLS FIRST,id ASC) AS tentativa FROM verificacoes_identidade WHERE usuario_id=${v.usuario_id}::uuid) ranked WHERE id=${id}::uuid`;res.json(serialize({...v,tentativa:Number(attempts[0]?.tentativa??1)}));};
export const reviewIdentity:RequestHandler=async(req,res)=>{
 const id=uuid(req.params.id),revoke=req.body?.revogar===true,approve=req.body?.aprovar===true||req.body?.status==="aprovado",reject=req.body?.aprovar===false||req.body?.status==="rejeitado";
 if(Number(revoke)+Number(approve)+Number(reject)!==1)throw new HttpError(422,"Decisão inválida");const reason=(revoke||reject)?text(req.body?.motivo,"Motivo",500):null;if((revoke||reject)&&(!reason||reason.length<5))throw new HttpError(422,"O motivo deve ter entre 5 e 500 caracteres","motivo_invalido");
 const result=await prisma.$transaction(async tx=>{await tx.$queryRaw`SELECT id FROM verificacoes_identidade WHERE id=${id}::uuid FOR UPDATE`;const v=await tx.verificacoes_identidade.findUnique({where:{id}});if(!v)throw new HttpError(404,"Verificação não encontrada");if(revoke&&v.status!=="aprovado")throw new HttpError(409,"Somente uma verificação aprovada pode ser revogada");if(!revoke&&v.status!=="pendente")throw new HttpError(409,"Verificação já analisada");const status=approve?"aprovado":"rejeitado";const row=await tx.verificacoes_identidade.update({where:{id},data:{status,motivo:reason,revogada:revoke,revisor_id:req.user!.id,analisado_em:new Date()}});await tx.usuarios.update({where:{id:v.usuario_id},data:{verificado:approve}});const action=approve?"verificacao_aprovada":revoke?"verificacao_revogada":"verificacao_reprovada";await audit(tx,req.user!.id,action,"verificacao",id,{motivo:reason});await tx.notificacoes.create({data:{usuario_id:v.usuario_id,tipo:action,titulo:approve?"Verificação aprovada":revoke?"Verificação revogada":"Verificação reprovada",mensagem:reason?`Motivo: ${reason}`:"Sua identidade foi verificada.",contexto:{verificacaoId:id}}});const user=await tx.usuarios.findUniqueOrThrow({where:{id:v.usuario_id},select:{email:true}});await tx.email_outbox.upsert({where:{chave:`${action}:${id}`},create:{tipo:action,destinatario:user.email,chave:`${action}:${id}`,payload:{subject:approve?"Verificação aprovada":revoke?"Verificação revogada":"Verificação reprovada",text:reason?`Motivo: ${reason}`:"Sua identidade foi verificada."}},update:{}});await tx.notificacoes_admin.updateMany({where:{referencia_tipo:"verificacao",referencia_id:id,tratada_em:null},data:{tratado_por_id:req.user!.id,tratada_em:new Date()}});return row;});res.json(serialize(result));
};
export const identityDocument:RequestHandler=async(req,res)=>{
 const id=uuid(req.params.id);
 const type=String(req.params.tipo);
 const documentKey=({frente:"documentoFrente",verso:"documentoVerso",selfie:"selfie",documentoFrente:"documentoFrente",documentoVerso:"documentoVerso"} as Record<string,string>)[type];
 if(!documentKey)throw new HttpError(422,"Tipo de arquivo inválido","tipo_arquivo_invalido");
 const v=await prisma.verificacoes_identidade.findUnique({where:{id},select:{id:true,documentos:true}});
 if(!v)throw new HttpError(404,"Verificação não encontrada");
 const file=(v.documentos as Record<string,unknown>)[documentKey];
 if(typeof file!=="string"||path.basename(file)!==file)throw new HttpError(404,"Documento não encontrado");
 const extension=path.extname(file).toLowerCase();
 const mime=({".jpg":"image/jpeg",".jpeg":"image/jpeg",".png":"image/png",".webp":"image/webp"} as Record<string,string>)[extension];
 if(!mime)throw new HttpError(404,"Documento não encontrado");
 let bytes:Buffer;
 try{bytes=await readFile(path.join(privateRoot,file));}catch(error){if((error as NodeJS.ErrnoException).code==="ENOENT")throw new HttpError(404,"Documento não encontrado");throw error;}
 if(!await validFileContent(bytes,mime))throw new HttpError(500,"Arquivo de verificação inválido","arquivo_verificacao_invalido");
 await prisma.admin_auditoria.create({data:{admin_id:req.user!.id,acao:"documento_verificacao_acessado",entidade:"verificacao",entidade_id:id,metadata:{tipo:type}}});
 res.setHeader("Cache-Control","private, no-store");
 res.setHeader("Content-Type",mime);
 res.status(200).send(bytes);
};
