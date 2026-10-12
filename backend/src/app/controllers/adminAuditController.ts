import type { RequestHandler } from "express";
import prisma from "../config/database.ts";
import { pagination } from "../utils/admin.ts";
import { businessDayStart, parseDateOnly } from "../utils/dates.ts";
import { HttpError } from "../utils/httpError.ts";
import { text } from "../utils/validation.ts";

const categoryMap:Record<string,string>={usuario:"usuarios",objeto:"anuncios",avaliacao:"avaliacoes",suporte:"denuncias",denuncia:"denuncias",verificacao:"verificacoes",categoria:"categorias",comunicado:"notificacoes"};
const allowed=["usuarios","anuncios","avaliacoes","denuncias","verificacoes","categorias","notificacoes"];
export const listAudit:RequestHandler=async(req,res)=>{
 const{page,limit,skip}=pagination(req,25);const category=req.query.categoria===undefined?undefined:String(req.query.categoria);if(category&&!allowed.includes(category))throw new HttpError(422,"Categoria inválida");const search=typeof req.query.busca==="string"&&req.query.busca.trim()?text(req.query.busca,"Busca",100):undefined;
 const start=req.query.de===undefined?undefined:businessDayStart(parseDateOnly(req.query.de,"Data inicial"));let end=req.query.ate===undefined?undefined:parseDateOnly(req.query.ate,"Data final");if(end){end.setUTCDate(end.getUTCDate()+1);end=businessDayStart(end);}if(start&&end&&start>=end)throw new HttpError(422,"Intervalo inválido");
 const entities=category?Object.entries(categoryMap).filter(([,value])=>value===category).map(([key])=>key):undefined;const where:any={...(entities?{entidade:{in:entities}}:{}),...(start||end?{criado_em:{...(start?{gte:start}:{}),...(end?{lt:end}:{})}}:{}),...(search?{OR:[{acao:{contains:search,mode:"insensitive"}},{entidade:{contains:search,mode:"insensitive"}},{admin:{nome:{contains:search,mode:"insensitive"}}}]}:{})};
 const[rows,total]=await Promise.all([prisma.admin_auditoria.findMany({where,orderBy:{criado_em:"desc"},skip,take:limit,include:{admin:{select:{id:true,nome:true}}}}),prisma.admin_auditoria.count({where})]);res.json({data:rows.map(row=>{const metadata=row.metadata as Record<string,unknown>;return{id:row.id,criado_em:row.criado_em,acao:row.acao,categoria:categoryMap[row.entidade]??row.entidade,admin:row.admin,alvo:{tipo:row.entidade,id:row.entidade_id,rotulo:typeof metadata.rotulo==="string"?metadata.rotulo:`${row.entidade} ${row.entidade_id}`},motivo:typeof metadata.motivo==="string"?metadata.motivo:null};}),total,page});
};
