import type { RequestHandler } from "express";
import prisma from "../config/database.ts";
import { text, uuid, slug } from "../utils/validation.ts";
import { HttpError } from "../utils/httpError.ts";
import { serializePayment, serializeReview } from "../utils/serializers.ts";
export const adminPayments: RequestHandler = async(req,res)=>{res.json((await prisma.pagamentos.findMany({take:100,skip:Math.max(0,Number(req.query.offset)||0),orderBy:{criado_em:"desc"}})).map(serializePayment));};
export const adminReviews: RequestHandler = async(_req,res)=>{res.json((await prisma.avaliacoes.findMany({take:100,orderBy:{criado_em:"desc"}})).map(serializeReview));};
export const removeReview: RequestHandler = async(req,res)=>{await prisma.avaliacoes.delete({where:{id:uuid(req.params.id)}});res.json({success:true});};
export function listCases(kind:"suporte"|"denuncia"|"sinistro"):RequestHandler{return async(_req,res)=>{
 const query={take:100,orderBy:{criado_em:"desc" as const}};
 res.json(kind==="suporte"?await prisma.suportes.findMany(query):kind==="denuncia"?await prisma.denuncias.findMany(query):await prisma.sinistros.findMany(query));
};}
export function reviewCase(kind:"suporte"|"denuncia"|"sinistro"):RequestHandler{return async(req,res)=>{
 const id=uuid(req.params.id),status=text(req.body?.status,"Status",30);
 const statuses=kind==="suporte"?["aberto","em_analise","respondido","fechado"]:kind==="denuncia"?["aberta","em_analise","procedente","improcedente","fechada"]:["aberto","em_analise","aprovado","rejeitado","fechado"];
 if(!statuses.includes(status))throw new HttpError(422,"Status inválido");
 const notes=text(req.body?.resposta ?? req.body?.notas ?? req.body?.notas_analise,"Resposta/Notas",10000);
 const result=await prisma.$transaction(async tx=>{
  const row=kind==="suporte"?await tx.suportes.update({where:{id},data:{status,resposta:notes}}):kind==="denuncia"?await tx.denuncias.update({where:{id},data:{status,notas:notes}}):await tx.sinistros.update({where:{id},data:{status,notas_analise:notes,atualizado_em:new Date()}});
  const uid="usuario_id" in row?row.usuario_id:row.reportador_id;
  await tx.notificacoes.create({data:{usuario_id:uid,tipo:kind,titulo:"Atendimento atualizado",mensagem:notes.slice(0,500),contexto:{recursoId:id}}});return row;
 });res.json(result);
};}
export const saveCategory:RequestHandler=async(req,res)=>{
 const nome=text(req.body?.nome,"Nome",80),normalized=slug(nome);
 if(!normalized)throw new HttpError(422,"Categoria inválida");
 const row=req.params.id?await prisma.categorias.update({where:{id:uuid(req.params.id)},data:{nome,slug:normalized}}):await prisma.categorias.upsert({where:{slug:normalized},update:{},create:{nome,slug:normalized}});
 res.status(req.params.id?200:201).json(row);
};
export const deleteCategory:RequestHandler=async(req,res)=>{
 const id=uuid(req.params.id);
 if(await prisma.itens.count({where:{categoria_id:id}}))throw new HttpError(409,"Categoria em uso");
 await prisma.categorias.delete({where:{id}});res.json({success:true});
};

export const adminReconciliations:RequestHandler=async(req,res)=>{res.json(await prisma.conciliacoes_pagamento.findMany({take:100,skip:Math.max(0,Number(req.query.offset)||0),orderBy:{criado_em:"desc"}}));};
export const adminPendingWebhooks:RequestHandler=async(req,res)=>{res.json(await prisma.webhook_eventos.findMany({where:{processado_em:null},take:100,skip:Math.max(0,Number(req.query.offset)||0),orderBy:{criado_em:"asc"}}));};
