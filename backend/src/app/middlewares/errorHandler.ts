import type { ErrorRequestHandler, RequestHandler } from "express";
import multer from "multer";
import { HttpError } from "../utils/httpError.ts";
import { cleanupRequestUploads } from "../utils/requestUploads.ts";
import env from "../config/env.ts";
import { InputValidationError } from "./validate.ts";
// Responde com erro padronizado quando nenhuma rota reconhece o caminho.
export const notFound: RequestHandler = (_req, res) => {
 res.status(404).json({ success:false,codigo:"nao_encontrada",message:"Rota não encontrada",mensagem:"Rota não encontrada" });
};
// Limpa uploads da requisição e transforma erros conhecidos em status e códigos estáveis.
// Conflitos do Prisma e da restrição de período viram respostas de negócio; erros desconhecidos são registrados sem expor detalhes.
export const errorHandler: ErrorRequestHandler = (error, req, res, _next) => {
 void cleanupRequestUploads(req);
 const reply=(status:number,message:string,codigo?:string)=>res.status(status).json({success:false,message,mensagem:message,codigo:codigo ?? ({400:"requisicao_invalida",401:"nao_autenticado",403:"nao_pertence",404:"nao_encontrada",409:"conflito",422:"dados_invalidos",500:"erro_interno",502:"gateway_indisponivel",503:"servico_indisponivel"} as Record<number,string>)[status] ?? "erro_requisicao"});
 if(error instanceof multer.MulterError){
  if(error.code==="LIMIT_FILE_SIZE" && req.originalUrl.split("?")[0]==="/api/uploads") reply(413,`O arquivo excede o limite máximo de ${env.CHAT_ATTACHMENT_MAX_MB} MB.`,"arquivo_muito_grande");
  else reply(422,`Erro no upload: ${error.message}`,"arquivo_invalido");
  return;
 }
 if(error instanceof InputValidationError){res.status(error.status).json({success:false,codigo:error.codigo,message:error.message,mensagem:error.message,erros:error.erros});return;}
 if(error instanceof HttpError){reply(error.status,error.message,error.codigo);return;}
 const prismaCode=typeof error==="object" && error!==null && "code"in error?String(error.code ?? ""):"";
 if(prismaCode==="P2023"){reply(422,"ID ou dados inválidos");return;}
 if(prismaCode==="P2002"){reply(409,"Já existe um registro com estes dados");return;}
 if(prismaCode==="P2003"){reply(409,"Este registro ainda está relacionado a outros dados");return;}
 if(prismaCode==="P2034"){reply(409,"A operação conflitou com outra requisição. Tente novamente.");return;}
 if(prismaCode==="23P01"){reply(409,"O objeto já está reservado neste período","objeto_indisponivel");return;}
 if(prismaCode==="P2025"){reply(404,"Registro não encontrado");return;}
 const status=typeof error==="object" && error!==null && "status"in error?Number(error.status):0;
 if(status>=400 && status<600){reply(status,"Erro na requisição");return;}
 console.error("Erro interno",error instanceof Error?error.name:"UnknownError");
 reply(500,"Erro interno do servidor");
};
