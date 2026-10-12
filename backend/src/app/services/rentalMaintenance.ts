import crypto from "node:crypto";
import { HttpError } from "../utils/httpError.ts";
import { paymentDeadline, PAYMENT_TIME_ZONE } from "./paymentRules.ts";
import prisma from "../config/database.ts";
import { businessDate } from "../utils/dates.ts";
import { createNotifications } from "./notificationPreferences.ts";
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
   await createNotifications(prisma, batch.flatMap(r => [r.locador_id,r.locatario_id].map(usuario_id => ({ usuario_id, chave: `${r.id}:${event}:${usuario_id}`, tipo: "lembrete", titulo: event.startsWith("retirada") ? "Lembrete de retirada" : "Lembrete de devolução", mensagem: event.endsWith("hoje") ? "A etapa está prevista para hoje." : "A etapa está prevista para amanhã.", contexto: { solicitacao_id: r.id, evento: event } }))), true);
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
   if (changed.count) {
    await tx.notificacoes.createMany({ data: [r.locador_id, r.locatario_id].map(usuario_id => ({ usuario_id, tipo: kind === "devolucao" ? "bloqueio_conta" : "retirada_atrasada", titulo: "Aluguel em atraso", mensagem: `Existe atraso na ${kind}.`, contexto: { solicitacao_id: r.id, aluguelId: r.id, objetoId: r.item_id } })) });
    await tx.notificacoes_admin.create({ data: { tipo: "locacao_atrasada", categoria: "pagamentos", prioridade: "alta", titulo: "Locação atrasada", mensagem: `Uma locação está com ${kind} atrasada.`, referencia_tipo: "aluguel", referencia_id: r.id, chave_deduplicacao: `locacao_atrasada:${r.id}:${kind}` } });
   }
  });
 }
 // A chamada leve encerra aqui; o ciclo periódico continua com estornos e conciliação.
 if(!processFinancialOperations)return;
 const { reconcilePaymentWebhooks, reconcileIncompletePayments, requestFinancial } = await import("../controllers/paymentsController.ts");
 // Uma confirmação unilateral não prova que a retirada deixou de acontecer. Mantém
 // a reserva e o pagamento intactos e abre uma única ocorrência para decisão humana.
 // O bloqueio do aluguel serializa este job com o segundo upload e com outros workers.
 while (true) {
  const unilateral = await prisma.$queryRaw<{id:string}[]>`
   SELECT a.id FROM alugueis a
   WHERE a.status = 'pago'
     AND a.data_inicio < ${today}
     AND (SELECT COUNT(*) FROM retiradas r WHERE r.aluguel_id = a.id) = 1
     AND NOT EXISTS (
       SELECT 1 FROM denuncias d
       WHERE d.relato_chave = 'retirada_evidencia_unilateral:' || a.id::text
     )
   ORDER BY a.id LIMIT 100`;
  if (!unilateral.length) break;
  for (const entry of unilateral) await prisma.$transaction(async tx => {
   await tx.$queryRaw`SELECT id FROM alugueis WHERE id=${entry.id}::uuid FOR UPDATE`;
   const rental = await tx.alugueis.findUniqueOrThrow({ where: { id: entry.id }, include: { retiradas: { select: { usuario_id: true, fotos: { select: { url: true } } } } } });
   if (rental.status !== "pago" || rental.data_inicio >= today || rental.retiradas.length !== 1) return;
   const key = `retirada_evidencia_unilateral:${rental.id}`;
   if (await tx.denuncias.findUnique({ where: { relato_chave: key }, select: { id: true } })) return;
   const submitterId = rental.retiradas[0]!.usuario_id;
   const occurrence = await tx.denuncias.create({ data: {
    usuario_id: submitterId,
    objeto_id: rental.item_id,
    aluguel_id: rental.id,
    etapa: "retirada",
    relato_chave: key,
    motivo: "retirada_evidencia_unilateral",
    assunto: "Retirada com evidência unilateral",
    mensagem: "Somente uma das partes enviou as fotos de retirada dentro da janela contratual. A reserva e o pagamento foram preservados para análise do suporte.",
    evidencias: rental.retiradas[0]!.fotos.map(photo => photo.url),
    prioridade: "alta",
    protocolo: `VIZIN-${new Date().toISOString().slice(0,10).replaceAll("-","")}-${crypto.randomUUID()}`,
   } });
   await tx.eventos_aluguel.create({ data: { aluguel_id: rental.id, status: rental.status, motivo: "Retirada com evidência unilateral encaminhada ao suporte" } });
   await tx.notificacoes_admin.create({ data: { tipo: "retirada_evidencia_unilateral", categoria: "denuncias", prioridade: "alta", titulo: "Retirada com evidência unilateral", mensagem: "Somente uma parte enviou fotos no prazo; reserva e pagamento aguardam análise.", referencia_tipo: "ocorrencia", referencia_id: occurrence.id, chave_deduplicacao: key } });
   await tx.notificacoes.createMany({ skipDuplicates: true, data: [rental.locador_id, rental.locatario_id].map(usuario_id => ({ usuario_id, chave: `${key}:${usuario_id}`, tipo: "suporte", titulo: "Retirada encaminhada ao suporte", mensagem: "Apenas uma parte enviou as fotos no prazo. A reserva foi preservada enquanto o suporte analisa o caso.", contexto: { solicitacao_id: rental.id, aluguelId: rental.id, recursoId: occurrence.id } })) });
  });
  if (unilateral.length < 100) break;
 }
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
    const claimed=await prisma.$transaction(async tx=>{
     const changed=await tx.alugueis.updateMany({ where: { id: rental.id, status: "pago", cancelado_por: null, retiradas: { none: {} } }, data: { status:"cancelado",cancelado_por: "sistema",atualizado_em:new Date() } });
     if(!changed.count)return false;
     await tx.eventos_aluguel.create({data:{aluguel_id:rental.id,status:"cancelado",motivo:"Retirada não realizada até o fim do dia contratado"}});
     await tx.notificacoes.createMany({ skipDuplicates: true, data: [rental.locador_id, rental.locatario_id].map(usuario_id => ({ usuario_id, chave: `${rental.id}:retirada_nao_realizada:${usuario_id}`, tipo: "aluguel_cancelado", titulo: "Retirada não realizada", mensagem: "O aluguel foi cancelado e o estorno será processado; acompanhe a confirmação do pagamento.", contexto: { solicitacao_id: rental.id } })) });
     return true;
    });
    if(!claimed)continue;
    await requestFinancial(payment.id, "refund");
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
