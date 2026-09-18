import path from "node:path";
import type { RequestHandler } from "express";
import prisma from "../config/database.ts";
import { HttpError } from "../utils/httpError.ts";
import { uuid, text } from "../utils/validation.ts";
import { serializeMessage } from "../utils/serializers.ts";
import { privateRoot } from "../middlewares/privateUpload.ts";
const include = { participantes: { include: { usuario: { select: { id:true,nome:true,foto_url:true,ativo:true } } } }, mensagens: { orderBy: { enviada_em: "desc" as const }, take:1, include:{anexo:true} } };
async function conversation(id: unknown, userId: string) {
 const c=await prisma.conversas.findFirst({where:{id:uuid(id),participantes:{some:{usuario_id:userId}}},include});
 if(!c) throw new HttpError(404,"Conversa não encontrada"); return c;
}
async function blocked(a:string,b:string) { return !!await prisma.bloqueios.findFirst({where:{OR:[{usuario_id:a,bloqueado_id:b},{usuario_id:b,bloqueado_id:a}]}}); }
async function dto(c: Awaited<ReturnType<typeof conversation>>, userId:string) {
 const other=c.participantes.find(p=>p.usuario_id!==userId)!.usuario;
 const item=c.objeto_id?await prisma.itens.findUnique({where:{id:c.objeto_id},select:{id:true,titulo:true}}):null;
 const unread=await prisma.mensagens.count({where:{conversa_id:c.id,destinatario_id:userId,lida:false}});
 return {id:c.id,user:{id:other.id,name:other.nome,avatar:other.foto_url,online:false},item:{name:item?.titulo??"Conversa geral",icon:"tool",produtoId:item?.id??null},unreadCount:unread,lastMessage:c.mensagens[0]?serializeMessage(c.mensagens[0],userId):null};
}
export const listConversations: RequestHandler = async(req,res) => {
 const rows=await prisma.conversas.findMany({where:{participantes:{some:{usuario_id:req.user!.id,arquivada:false}}},include,orderBy:{atualizado_em:"desc"},take:100});
 const hidden=await prisma.bloqueios.findMany({where:{usuario_id:req.user!.id}});
 res.json(await Promise.all(rows.filter(c=>!c.participantes.some(p=>hidden.some(b=>b.bloqueado_id===p.usuario_id))).map(c=>dto(c,req.user!.id))));
};
export const createConversation: RequestHandler = async(req,res) => {
 const otherId=uuid(req.body?.userId);
 if(otherId===req.user!.id) throw new HttpError(422,"Não pode conversar consigo mesmo");
 const other=await prisma.usuarios.findUnique({where:{id:otherId}});
 if(!other?.ativo || await blocked(req.user!.id,otherId)) throw new HttpError(403,"Usuário indisponível");
 const itemId=req.body?.produtoId?uuid(req.body.produtoId):null;
 if(itemId) {
  const item=await prisma.itens.findUnique({where:{id:itemId}});
  if(!item || item.arquivado || ![otherId,req.user!.id].includes(item.usuario_id)) throw new HttpError(422,"Anúncio inválido para os participantes");
 }
 const key=[req.user!.id,otherId].sort().join(":")+":"+(itemId??"geral");
 const c=await prisma.conversas.upsert({where:{chave:key},update:{},create:{chave:key,objeto_id:itemId,participantes:{create:[{usuario_id:req.user!.id},{usuario_id:otherId}]}},include});
 await prisma.participantes_conversa.update({where:{conversa_id_usuario_id:{conversa_id:c.id,usuario_id:req.user!.id}},data:{arquivada:false}});
 res.status(201).json({...await dto(c,req.user!.id),messages:[]});
};
export const getConversationMessages: RequestHandler = async(req,res) => {
 const c=await conversation(req.params.id,req.user!.id);
 const limit=Math.min(100,Math.max(1,Number(req.query.limit??100)));
 if(!Number.isInteger(limit)) throw new HttpError(422,"Limite inválido");
 const rows=await prisma.mensagens.findMany({where:{conversa_id:c.id},include:{anexo:true},orderBy:{enviada_em:"desc"},take:limit,...(req.query.before?{cursor:{id:uuid(req.query.before)},skip:1}:{})});
 res.json(rows.reverse().map(m=>serializeMessage(m,req.user!.id)));
};
export const sendConversationMessage: RequestHandler = async(req,res) => {
 const c=await conversation(req.params.id,req.user!.id);
 const other=c.participantes.find(p=>p.usuario_id!==req.user!.id)!.usuario;
 const content=req.body?.text?text(req.body.text,"Mensagem",3000):"";
 const attachmentId=req.body?.attachmentId?uuid(req.body.attachmentId):null;
 if(!content && !attachmentId) throw new HttpError(422,"Mensagem vazia");
 const row=await prisma.$transaction(async tx=>{
  // Lock both users in stable order to serialize block/send operations.
  for(const uid of [req.user!.id,other.id].sort()) await tx.$queryRaw`SELECT id FROM usuarios WHERE id=${uid}::uuid FOR UPDATE`;
  if(!other.ativo || await tx.bloqueios.count({where:{OR:[{usuario_id:req.user!.id,bloqueado_id:other.id},{usuario_id:other.id,bloqueado_id:req.user!.id}]}})) throw new HttpError(403,"Conversa bloqueada");
  if(attachmentId && !await tx.anexos.findFirst({where:{id:attachmentId,usuario_id:req.user!.id,mensagem:null}})) throw new HttpError(403,"Anexo indisponível");
  const m=await tx.mensagens.create({data:{conversa_id:c.id,remetente_id:req.user!.id,destinatario_id:other.id,conteudo:content,anexo_id:attachmentId},include:{anexo:true}});
  await tx.conversas.update({where:{id:c.id},data:{atualizado_em:new Date()}});
  await tx.notificacoes.create({data:{usuario_id:other.id,tipo:"mensagem",titulo:"Nova mensagem",mensagem:content.slice(0,140)||"Novo anexo",contexto:{conversaId:c.id,usuarioId:req.user!.id,...(c.objeto_id?{objetoId:c.objeto_id}:{})}}});
  return m;
 }); res.status(201).json(serializeMessage(row,req.user!.id));
};
export const readConversation: RequestHandler = async(req,res)=>{
 const c=await conversation(req.params.id,req.user!.id);
 await prisma.$transaction([prisma.mensagens.updateMany({where:{conversa_id:c.id,destinatario_id:req.user!.id,lida:false},data:{lida:true}}),prisma.participantes_conversa.update({where:{conversa_id_usuario_id:{conversa_id:c.id,usuario_id:req.user!.id}},data:{lida_em:new Date()}})]);res.json({success:true});
};
export const archiveConversation: RequestHandler = async(req,res)=>{
 const c=await conversation(req.params.id,req.user!.id);
 await prisma.participantes_conversa.update({where:{conversa_id_usuario_id:{conversa_id:c.id,usuario_id:req.user!.id}},data:{arquivada:true}});res.json({success:true});
};
export const blockUser: RequestHandler = async(req,res)=>{
 const target=req.params.userId?uuid(req.params.userId):(await conversation(req.params.id,req.user!.id)).participantes.find(p=>p.usuario_id!==req.user!.id)!.usuario_id;
 if(target===req.user!.id) throw new HttpError(422,"Usuário inválido");
 await prisma.$transaction(async tx=>{
  for(const uid of [req.user!.id,target].sort()) await tx.$queryRaw`SELECT id FROM usuarios WHERE id=${uid}::uuid FOR UPDATE`;
  await tx.bloqueios.upsert({where:{usuario_id_bloqueado_id:{usuario_id:req.user!.id,bloqueado_id:target}},create:{usuario_id:req.user!.id,bloqueado_id:target},update:{}});
 });res.json({success:true});
};
export const unblockUser: RequestHandler = async(req,res)=>{await prisma.bloqueios.deleteMany({where:{usuario_id:req.user!.id,bloqueado_id:uuid(req.params.userId)}});res.json({success:true});};
export const blockedUsers: RequestHandler = async(req,res)=>{res.json((await prisma.bloqueios.findMany({where:{usuario_id:req.user!.id},include:{bloqueado:{select:{id:true,nome:true,foto_url:true}}}})).map(b=>({id:b.bloqueado.id,name:b.bloqueado.nome,avatar:b.bloqueado.foto_url})));};
export const uploadAttachment: RequestHandler = async(req,res)=>{
 const f=req.file;if(!f) throw new HttpError(422,"Envie um arquivo");
 const a=await prisma.anexos.create({data:{usuario_id:req.user!.id,caminho:path.basename(f.path),nome:path.basename(f.originalname).replace(/[\x00-\x1f]/g,"").slice(0,200),mime:f.mimetype,tamanho:f.size}});
 res.status(201).json({id:a.id,url:`/api/uploads/${a.id}`,name:a.nome,mimeType:a.mime,type:a.mime.startsWith("image/")?"image":a.mime.startsWith("video/")?"video":"file"});
};
export const downloadAttachment: RequestHandler = async(req,res)=>{
 const a=await prisma.anexos.findUniqueOrThrow({where:{id:uuid(req.params.id)},include:{mensagem:true}});
 const evidence=await prisma.denuncias.findFirst({where:{evidencias:{array_contains:[a.id]}}});
 if(a.usuario_id!==req.user!.id && a.mensagem?.destinatario_id!==req.user!.id && !(req.user!.tipo==="admin" && evidence)) throw new HttpError(403,"Anexo inacessível");
 if(path.basename(a.caminho)!==a.caminho) throw new HttpError(404,"Arquivo não encontrado");
 res.setHeader("Cache-Control","no-store");res.download(path.join(privateRoot,a.caminho),a.nome);
};
