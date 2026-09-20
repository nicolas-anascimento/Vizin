import path from "node:path";
import { unlink } from "node:fs/promises";
import prisma from "../config/database.ts";
import { privateRoot } from "../middlewares/privateUpload.ts";
import { removeUploadByUrl } from "../utils/files.ts";
import { HttpError } from "../utils/httpError.ts";
import { audit } from "../utils/admin.ts";
import { activeStatuses } from "./rentalRules.ts";
// Verifica obrigações abertas antes de desativar ou remover conta e seus vínculos permitidos.
export async function removeAccount(id: string, deactivateOnly=false, adminId?: string): Promise<void> {
 // Bloqueia a conta e verifica aluguéis e pagamentos abertos antes de desativar.
 // A transação serializável impede que uma nova obrigação seja criada entre a
 // checagem e a alteração do usuário.
 const result=await prisma.$transaction(async tx=>{
  await tx.$queryRaw`SELECT id FROM usuarios WHERE id=${id}::uuid FOR UPDATE`;
  const user=await tx.usuarios.findUniqueOrThrow({where:{id}});
  if(await tx.alugueis.count({where:{OR:[{locador_id:id},{locatario_id:id}],status:{in:activeStatuses}}}) || await tx.pagamentos.count({where:{alugueis:{OR:[{locador_id:id},{locatario_id:id}]},status:{in:["pendente","conciliacao","estorno_pendente","cancelamento_pendente"]}}}))throw new HttpError(409,"Conta possui obrigações ativas","usuario_com_obrigacoes_ativas");
  await tx.itens.updateMany({where:{usuario_id:id},data:{disponivel:false,...(!deactivateOnly?{arquivado:true,endereco_id:null}:{})}});
  const documents=deactivateOnly?[]:await tx.verificacoes_identidade.findMany({where:{usuario_id:id},select:{documentos:true}});
  if(!deactivateOnly){await tx.enderecos.deleteMany({where:{usuario_id:id}});await tx.verificacoes_identidade.deleteMany({where:{usuario_id:id}});}
  await tx.usuarios.update({where:{id},data:{ativo:false,token_version:{increment:1},...(!deactivateOnly?{nome:"Usuário removido",email:`removido-${id}@invalid.local`,cpf:null,telefone:null,bio:null,foto_url:null,verificado:false,preferencias:{},privacidade:{perfilPublico:false}}:{})}});
  if (adminId) await audit(tx, adminId, "arquivar", "usuario", id);
  await tx.resetar_Senha.deleteMany({where:{userId:id}});await tx.emails_pendentes.deleteMany({where:{usuario_id:id}});
  return{avatar:deactivateOnly?null:user.foto_url,documents};
 },{isolationLevel:"Serializable"});
 // Só depois da confirmação no banco remove arquivos locais que não são transacionais.
 await removeUploadByUrl(result.avatar);
 for(const row of result.documents)for(const file of Object.values(row.documentos as Record<string,string>))if(typeof file==="string" && path.basename(file)===file)await unlink(path.join(privateRoot,file)).catch(()=>undefined);
}
