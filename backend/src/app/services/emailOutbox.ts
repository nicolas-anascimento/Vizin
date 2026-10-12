import prisma from "../config/database.ts";
import mailer from "../config/mailer.ts";
import env from "../config/env.ts";

export async function processEmailOutbox():Promise<void>{
 const now=new Date();const rows=await prisma.email_outbox.findMany({where:{status:"pendente",AND:[{OR:[{proxima_em:null},{proxima_em:{lte:now}}]},{OR:[{lease_ate:null},{lease_ate:{lt:now}}]}]},orderBy:{criado_em:"asc"},take:20});
 for(const row of rows){const lease=new Date(Date.now()+120000);const claimed=await prisma.email_outbox.updateMany({where:{id:row.id,status:"pendente",OR:[{lease_ate:null},{lease_ate:{lt:now}}]},data:{lease_ate:lease,tentativas:{increment:1}}});if(!claimed.count)continue;
  if(!mailer){await prisma.email_outbox.update({where:{id:row.id},data:{lease_ate:null,proxima_em:new Date(Date.now()+15*60000),ultimo_erro:"SMTP não configurado"}});continue;}
  try{const payload=row.payload as Record<string,unknown>;await mailer.sendMail({from:env.SMTP_FROM,to:row.destinatario,subject:String(payload.subject??"VIZIN"),text:String(payload.text??"")});await prisma.email_outbox.update({where:{id:row.id},data:{status:"enviado",enviado_em:new Date(),lease_ate:null,ultimo_erro:null}});}catch(error){await prisma.email_outbox.update({where:{id:row.id},data:{lease_ate:null,proxima_em:new Date(Date.now()+Math.min(3600000,60000*2**Math.min(row.tentativas,6))),ultimo_erro:error instanceof Error?error.message.slice(0,500):"Falha SMTP"}});}
 }
}
