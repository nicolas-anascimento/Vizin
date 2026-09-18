import crypto from "node:crypto";
import type { RequestHandler } from "express";
import prisma from "../config/database.ts";
import { HttpError } from "../utils/httpError.ts";
import { text, uuid } from "../utils/validation.ts";
const protocol = () => `VIZIN-${new Date().toISOString().slice(0,10).replaceAll("-", "")}-${crypto.randomUUID()}`;
export const requestHelp: RequestHandler = async(req,res) => {
 const row = await prisma.suportes.create({data:{usuario_id:req.user!.id,assunto:text(req.body?.assunto,"Assunto",150),mensagem:text(req.body?.mensagem,"Mensagem",10000),protocolo:protocol()}});
 res.status(201).json({success:true,id:row.id,protocolo:row.protocolo,status:row.status});
};
export const report: RequestHandler = async(req,res) => {
 let conversationId: string | null = req.params.id ? uuid(req.params.id) : null;
 let target = req.body?.contra ?? req.body?.usuarioId ?? req.body?.denunciado_id;
 if (conversationId) {
  const c = await prisma.conversas.findFirst({where:{id:conversationId,participantes:{some:{usuario_id:req.user!.id}}},include:{participantes:true}});
  if(!c) throw new HttpError(404,"Conversa não encontrada");
  target=c.participantes.find(p=>p.usuario_id!==req.user!.id)?.usuario_id;
 }
 const rentalId = req.body?.aluguelId ?? req.body?.aluguel_id;
 if(rentalId) {
  const r=await prisma.alugueis.findUnique({where:{id:uuid(rentalId)}});
  if(!r || ![r.locador_id,r.locatario_id].includes(req.user!.id)) throw new HttpError(403,"Aluguel inacessível");
 }
 const itemId=req.body?.produtoId ?? req.body?.objeto_id;
 if(itemId && !await prisma.itens.findUnique({where:{id:uuid(itemId)}})) throw new HttpError(404,"Objeto não encontrado");
 if(target && (target===req.user!.id || !await prisma.usuarios.findUnique({where:{id:uuid(target)}}))) throw new HttpError(422,"Usuário denunciado inválido");
 const ids=req.body?.anexoIds ?? (req.body?.attachmentId ? [req.body.attachmentId] : []);
 if(!Array.isArray(ids) || ids.length>5) throw new HttpError(422,"Evidências inválidas");
 const attachments=await prisma.anexos.findMany({where:{id:{in:ids.map(id=>uuid(id))},usuario_id:req.user!.id}});
 if(attachments.length!==ids.length) throw new HttpError(403,"Evidência inacessível");
 const row=await prisma.denuncias.create({data:{usuario_id:req.user!.id,denunciado_id:target?uuid(target):null,objeto_id:itemId?uuid(itemId):null,aluguel_id:rentalId?uuid(rentalId):null,conversa_id:conversationId,motivo:text(req.body?.motivo,"Motivo",150),assunto:req.body?.assunto?text(req.body.assunto,"Assunto",150):null,mensagem:text(req.body?.mensagem,"Mensagem",10000),evidencias:ids,protocolo:protocol()}});
 res.status(201).json({success:true,id:row.id,protocolo:row.protocolo,status:row.status});
};
export const reportClaim: RequestHandler = async(req,res) => {
 const id=uuid(req.body?.aluguel_id ?? req.body?.aluguelId);
 const r=await prisma.alugueis.findUniqueOrThrow({where:{id}});
 if(![r.locador_id,r.locatario_id].includes(req.user!.id)) throw new HttpError(403,"Acesso negado");
 if(!["retirado","devolvido","finalizado"].includes(r.status??"")) throw new HttpError(409,"Sinistro exige aluguel com retirada registrada");
 const amount=req.body?.valor_solicitado;
 if(amount!==undefined && (!Number.isFinite(Number(amount)) || Number(amount)<0 || Number(amount)>Number(r.valor_total)*100)) throw new HttpError(422,"Valor inválido");
 res.status(201).json(await prisma.sinistros.create({data:{aluguel_id:id,reportador_id:req.user!.id,descricao:text(req.body?.descricao ?? req.body?.mensagem,"Descrição",10000),...(amount!==undefined?{valor_solicitado:Number(amount)}:{})}}));
};
export const mySupport: RequestHandler = async(req,res) => {
 const [suporte,denuncias,sinistros]=await Promise.all([prisma.suportes.findMany({where:{usuario_id:req.user!.id}}),prisma.denuncias.findMany({where:{usuario_id:req.user!.id}}),prisma.sinistros.findMany({where:{reportador_id:req.user!.id}})]);
 res.json({suporte,denuncias,sinistros});
};
