import { HttpError } from "../utils/httpError.ts";
import { paymentDeadline, PAYMENT_TIME_ZONE } from "./paymentRules.ts";
import prisma from "../config/database.ts";
import { businessDate } from "../utils/dates.ts";
/*
 * Executa a manutenção ao consultar locações e, periodicamente, pelo servidor.
 * Procura vencimentos em lotes de 100 para limitar memória e tamanho das consultas.
 * Quando solicitado, também reconcilia operações financeiras pendentes.
 */
export async function maintainRentals(processFinancialOperations = false): Promise<void> {
 const now = new Date();
 // Drena todos os lotes expirados. Cada aluguel é bloqueado e revalidado dentro da
 // transação: uma aprovação ou pagamento concorrente pode ter alterado seu estado.
 while(true) {
  const expired=await prisma.$queryRaw<{id:string}[]>`SELECT id FROM alugueis WHERE
   (status='pendente' AND expira_em <= ${now}) OR
   (status='aprovado' AND ((data_inicio + 1)::timestamp AT TIME ZONE ${PAYMENT_TIME_ZONE}) <= (${now}::timestamp AT TIME ZONE 'UTC'))
   ORDER BY id LIMIT 100`;
  if(!expired.length)break;
  for(const entry of expired)await prisma.$transaction(async tx=>{
   await tx.$queryRaw`SELECT id FROM alugueis WHERE id=${entry.id}::uuid FOR UPDATE`;
   const r=await tx.alugueis.findUniqueOrThrow({where:{id:entry.id}});
   if(r.status!=="pendente" && r.status!=="aprovado")return;
   const deadline=r.status==="pendente"?r.expira_em:paymentDeadline(r);
   if(!deadline || deadline>now)return;
   await tx.alugueis.update({where:{id:r.id},data:{status:"cancelado",cancelado_por:"sistema",atualizado_em:now,...(r.status==="aprovado"?{pagamento_ate:deadline}:{})}});
   await tx.eventos_aluguel.create({data:{aluguel_id:r.id,status:"cancelado",motivo:r.status==="pendente"?"Solicitação expirada":"Prazo de pagamento expirado"}});
   await tx.pagamentos.updateMany({where:{aluguel_id:r.id,tipo:"aluguel",status:"pendente",gateway:"demo"},data:{status:"cancelado"}});
   await tx.pagamentos.updateMany({where:{aluguel_id:r.id,tipo:"aluguel",status:"pendente",gateway:{in:["real","mercado_pago"]}},data:{status:"cancelamento_pendente"}});
   await tx.notificacoes.createMany({data:[r.locador_id,r.locatario_id].map(usuario_id=>({usuario_id,tipo:"aluguel_cancelado",titulo:"Prazo expirado",mensagem:"Aluguel cancelado por prazo expirado.",contexto:{aluguelId:r.id,objetoId:r.item_id,solicitacao_id:r.id}}))});
  });
 }
 // Define hoje e amanhã no calendário comercial para os lembretes de retirada e devolução.
 const today = businessDate(now);
 const tomorrow = new Date(today.getTime() + 86400000);
 for (const [date, status, event] of [[today,"pago","retirada_hoje"],[tomorrow,"pago","retirada_amanha"],[today,"retirado","devolucao_hoje"],[tomorrow,"retirado","devolucao_amanha"]] as const) {
  let cursor: string | undefined;
  while (true) {
   const batch = await prisma.alugueis.findMany({ where: { status, ...(event.startsWith("retirada") ? { data_inicio: date } : { data_fim: date }) }, select: { id: true, locador_id: true, locatario_id: true }, orderBy: { id: "asc" }, take: 100, ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}) });
   if (!batch.length) break;
   await prisma.notificacoes.createMany({ skipDuplicates: true, data: batch.flatMap(r => [r.locador_id,r.locatario_id].map(usuario_id => ({ usuario_id, chave: `${r.id}:${event}:${usuario_id}`, tipo: "lembrete", titulo: event.startsWith("retirada") ? "Lembrete de retirada" : "Lembrete de devolução", mensagem: event.endsWith("hoje") ? "A etapa está prevista para hoje." : "A etapa está prevista para amanhã.", contexto: { solicitacao_id: r.id, evento: event } }))) });
   cursor = batch[batch.length - 1]!.id;
   if (batch.length < 100) break;
  }
 }
 // Marca avisos de atraso de forma condicional, evitando notificações repetidas por execuções concorrentes.
 const late = await prisma.alugueis.findMany({ where: { OR: [{ status: "pago", data_inicio: { lt: today }, OR:[{atraso_notificado:null},{atraso_notificado:{not:"retirada"}}] }, { status: "retirado", data_fim: { lt: today }, OR:[{atraso_notificado:null},{atraso_notificado:{not:"devolucao"}}] }] }, take: 100 });
 for (const r of late) {
  const kind = r.status === "pago" ? "retirada" : "devolucao";
  if (r.atraso_notificado === kind) continue;
  await prisma.$transaction(async tx => {
   const changed = await tx.alugueis.updateMany({ where: { id: r.id, status: r.status, atraso_notificado: r.atraso_notificado }, data: { atraso_notificado: kind } });
   if (changed.count) await tx.notificacoes.createMany({ data: [r.locador_id, r.locatario_id].map(usuario_id => ({ usuario_id, tipo: kind === "devolucao" ? "bloqueio_conta" : "lembrete", titulo: "Aluguel em atraso", mensagem: `Existe atraso na ${kind}.`, contexto: { solicitacao_id: r.id, aluguelId: r.id, objetoId: r.item_id } })) });
  });
 }
 // A chamada leve encerra aqui; o ciclo periódico continua com estornos e conciliação.
 if(!processFinancialOperations)return;
 const { reconcilePaymentWebhooks, reconcileIncompletePayments, requestFinancial } = await import("../controllers/paymentsController.ts");
 // Pagamentos de retirada não realizada são estornados por intenção persistida;
 // a chamada externa ao gateway ocorre fora da transação do banco.
 let refundCursor: string | undefined;
 while (true) {
  const due = await prisma.alugueis.findMany({ where: { status: "pago", data_inicio: { lt: today }, retiradas: { none: {} }, pagamentos: { some: { tipo: "aluguel", status: "pago" } } }, select: { id: true, locador_id: true, locatario_id: true, pagamentos: { where: { tipo: "aluguel", status: "pago" }, select: { id: true }, take: 1 } }, orderBy: { id: "asc" }, take: 100, ...(refundCursor ? { cursor: { id: refundCursor }, skip: 1 } : {}) });
  if (!due.length) break;
  for (const rental of due) {
   const payment = rental.pagamentos[0];
   if (!payment) continue;
   try {
    await prisma.alugueis.updateMany({ where: { id: rental.id, status: "pago", cancelado_por: null }, data: { cancelado_por: "sistema" } });
    await requestFinancial(payment.id, "refund");
    await prisma.notificacoes.createMany({ skipDuplicates: true, data: [rental.locador_id, rental.locatario_id].map(usuario_id => ({ usuario_id, chave: `${rental.id}:retirada_nao_realizada:${usuario_id}`, tipo: "aluguel_cancelado", titulo: "Retirada não realizada", mensagem: "O estorno foi solicitado; acompanhe a confirmação do pagamento.", contexto: { solicitacao_id: rental.id } })) });
   } catch (error) { console.error("Estorno por retirada não realizada continua pendente", rental.id, error instanceof HttpError ? error.codigo ?? error.message : error instanceof Error ? error.name : "Falha"); }
  }
  refundCursor = due[due.length - 1]!.id;
  if (due.length < 100) break;
 }
 await reconcilePaymentWebhooks();
 await reconcileIncompletePayments();
 const { reconcileCardOperations } = await import("../controllers/cardsController.ts");
 await reconcileCardOperations();
 // Reprocessa cancelamentos e estornos pendentes em lotes, com a mesma chave idempotente.
 let operationCursor: string | undefined;
 while (true) {
  const operations=await prisma.pagamentos.findMany({where:{OR:[{gateway:"real",referencia:{not:null}},{gateway:"mercado_pago"}],status:{in:["cancelamento_pendente","estorno_pendente"]}},orderBy:{id:"asc"},take:100,...(operationCursor?{cursor:{id:operationCursor},skip:1}:{})});
  if(!operations.length)break;
  for(const payment of operations) {
   try {await requestFinancial(payment.id,payment.status==="estorno_pendente"?"refund":"cancel");}
   catch(error) {console.error("Operação financeira continua pendente",payment.id,error instanceof HttpError?error.codigo ?? error.message:error instanceof Error?error.name:"Falha no provedor");}
  }
  operationCursor=operations[operations.length-1]!.id;
  if(operations.length<100)break;
 }
}
