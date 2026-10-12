import crypto from "node:crypto";
import type { RequestHandler } from "express";
import prisma from "../config/database.ts";
import { HttpError } from "../utils/httpError.ts";
import { audit, pagination } from "../utils/admin.ts";
import { text, uuid } from "../utils/validation.ts";
import { campaignAudienceWhere, campaignSegments, processAdminCampaigns, type CampaignSegment } from "../services/adminCampaigns.ts";
import { publishNotification } from "../../realtime/realtimeService.ts";
import { serializeNotification } from "../utils/serializers.ts";

function campaignDto(row: any) { return { id: row.id, titulo: row.titulo, mensagem: row.mensagem, destinatarios: row.destinatarios, status: row.status, agendada_para: row.agendada_para, enviada_em: row.enviada_em, criado_em: row.criado_em, atualizado_em: row.atualizado_em, total_destinatarios: row.total_destinatarios, erro_envio: row.erro_envio, criado_por: row.criado_por }; }
function input(body: any) {
  const titulo = text(body?.titulo, "Título", 100);
  const status = text(body?.status, "Status", 20);
  if (!campaignSegments.includes(body?.destinatarios)) throw new HttpError(422, "Segmento inválido");
  if (!["rascunho", "agendada", "enviada"].includes(status)) throw new HttpError(422, "Status inválido");
  const mensagem = body?.mensagem === "" && status === "rascunho" ? "" : text(body?.mensagem, "Mensagem", 500);
  if (status !== "rascunho" && mensagem.length < 5) throw new HttpError(422, "A mensagem deve ter ao menos 5 caracteres");
  const scheduled = status === "agendada" ? new Date(body?.agendada_para) : null;
  if (status === "agendada" && (!scheduled || Number.isNaN(scheduled.getTime()) || scheduled <= new Date())) throw new HttpError(422, "Agendamento deve estar no futuro");
  return { titulo, mensagem, destinatarios: body.destinatarios as CampaignSegment, status: status === "enviada" ? "enviando" : status, agendada_para: scheduled };
}
export const listCampaigns: RequestHandler = async (req,res) => { const {page,limit,skip}=pagination(req,10); const [rows,total]=await Promise.all([prisma.comunicados_admin.findMany({orderBy:{criado_em:"desc"},skip,take:limit,include:{criado_por:{select:{id:true,nome:true}}}}),prisma.comunicados_admin.count()]); res.json({dados:rows.map(campaignDto),total,pagina:page}); };
export const campaignStats: RequestHandler = async (_req,res) => { const [sent,scheduled,users]=await Promise.all([prisma.comunicados_admin.count({where:{status:"enviada"}}),prisma.comunicados_admin.count({where:{status:"agendada"}}),prisma.usuarios.count()]);res.json({enviadas:sent,agendadas:scheduled,total_usuarios:users}); };
export const audienceCount: RequestHandler = async (req,res) => { const segment=String(req.query.segmento) as CampaignSegment;if(!campaignSegments.includes(segment))throw new HttpError(422,"Segmento inválido");res.json({quantidade:await prisma.usuarios.count({where:campaignAudienceWhere(segment)})}); };
export const testCampaign: RequestHandler = async (req,res) => { const titulo=text(req.body?.titulo,"Título",100),mensagem=text(req.body?.mensagem,"Mensagem",500);const notification=await prisma.notificacoes.create({data:{usuario_id:req.user!.id,tipo:"comunicado_admin",titulo,mensagem,contexto:{teste:true}}});publishNotification(req.user!.id,serializeNotification(notification));res.status(201).json({success:true,id:notification.id}); };
export const createCampaign: RequestHandler = async (req,res) => {
  const data=input(req.body), key=text(req.body?.chave_idempotencia,"Chave de idempotência",200);
  const hash=crypto.createHash("sha256").update(JSON.stringify(data)).digest("hex");
  const existing=await prisma.comunicados_admin.findUnique({where:{chave_idempotencia:key},include:{criado_por:{select:{id:true,nome:true}}}});
  if(existing){if(existing.payload_hash!==hash)throw new HttpError(409,"Chave de idempotência reutilizada com conteúdo diferente","idempotencia_conflito");res.json(campaignDto(existing));return;}
  let row;
  try {
    row=await prisma.comunicados_admin.create({data:{...data,chave_idempotencia:key,payload_hash:hash,criado_por_id:req.user!.id},include:{criado_por:{select:{id:true,nome:true}}}});
  } catch (error: any) {
    if (error?.code !== "P2002") throw error;
    const raced=await prisma.comunicados_admin.findUnique({where:{chave_idempotencia:key},include:{criado_por:{select:{id:true,nome:true}}}});
    if(!raced || raced.payload_hash!==hash)throw new HttpError(409,"Chave de idempotência reutilizada com conteúdo diferente","idempotencia_conflito");
    res.json(campaignDto(raced));return;
  }
  if(row.status==="enviando")void processAdminCampaigns().catch(error=>console.error("Falha ao iniciar comunicado",error));
  res.status(201).json(campaignDto(row));
};
export const updateCampaign: RequestHandler = async (req,res) => {
  const id=uuid(req.params.id),data=input(req.body);
  const row=await prisma.$transaction(async tx=>{const current=await tx.comunicados_admin.findUnique({where:{id}});if(!current)throw new HttpError(404,"Comunicado não encontrado");if(!["rascunho","agendada","falhou"].includes(current.status))throw new HttpError(409,"Comunicado não pode mais ser editado");return tx.comunicados_admin.update({where:{id},data:{...data,erro_envio:null},include:{criado_por:{select:{id:true,nome:true}}}});});
  if(row.status==="enviando")void processAdminCampaigns().catch(error=>console.error("Falha ao iniciar comunicado",error));res.json(campaignDto(row));
};
export const deleteCampaign: RequestHandler = async (req,res) => { const id=uuid(req.params.id);await prisma.$transaction(async tx=>{const row=await tx.comunicados_admin.findUnique({where:{id}});if(!row)throw new HttpError(404,"Comunicado não encontrado");if(!["rascunho","agendada","falhou"].includes(row.status))throw new HttpError(409,"Comunicado enviado não pode ser excluído");await audit(tx,req.user!.id,"comunicado_cancelado","comunicado",id);await tx.comunicados_admin.delete({where:{id}});});res.json({success:true}); };
