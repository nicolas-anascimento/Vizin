import prisma from "../config/database.ts";
export async function maintainRentals(processFinancialOperations = false): Promise<void> {
 const now = new Date();
 const expired = await prisma.alugueis.findMany({ where: { OR: [{ status: "pendente", expira_em: { lt: now } }, { status: "aprovado", pagamento_ate: { lt: now } }] }, take: 100 });
 for (const r of expired) await prisma.$transaction(async tx => {
  const result = await tx.alugueis.updateMany({ where: { id: r.id, status: r.status }, data: { status: "cancelado", atualizado_em: now } });
  if (!result.count) return;
  await tx.eventos_aluguel.create({ data: { aluguel_id: r.id, status: "cancelado", motivo: r.status === "pendente" ? "Solicitação expirada" : "Prazo de pagamento expirado" } });
  await tx.pagamentos.updateMany({ where: { aluguel_id: r.id, status: "pendente",gateway:"demo" }, data: { status: "cancelado" } });
  await tx.pagamentos.updateMany({ where: { aluguel_id: r.id, status: "pendente",gateway:"real" }, data: { status: "cancelamento_pendente" } });
  await tx.notificacoes.createMany({ data: [r.locador_id, r.locatario_id].map(usuario_id => ({ usuario_id, tipo: "cancelamento", titulo: "Prazo expirado", mensagem: "Aluguel cancelado por prazo expirado.", contexto: { aluguelId: r.id, objetoId: r.item_id, solicitacaoId: r.id } })) });
 });
 const today = new Date(now.toISOString().slice(0,10));
 const late = await prisma.alugueis.findMany({ where: { OR: [{ status: "pago", data_inicio: { lt: today }, OR:[{atraso_notificado:null},{atraso_notificado:{not:"retirada"}}] }, { status: "retirado", data_fim: { lt: today }, OR:[{atraso_notificado:null},{atraso_notificado:{not:"devolucao"}}] }] }, take: 100 });
 for (const r of late) {
  const kind = r.status === "pago" ? "retirada" : "devolucao";
  if (r.atraso_notificado === kind) continue;
  await prisma.$transaction(async tx => {
   const changed = await tx.alugueis.updateMany({ where: { id: r.id, status: r.status, atraso_notificado: r.atraso_notificado }, data: { atraso_notificado: kind } });
   if (changed.count) await tx.notificacoes.createMany({ data: [r.locador_id, r.locatario_id].map(usuario_id => ({ usuario_id, tipo: "atraso", titulo: "Aluguel em atraso", mensagem: `Existe atraso na ${kind}.`, contexto: { aluguelId: r.id, objetoId: r.item_id } })) });
  });
 }
 const { reconcilePaymentWebhooks, requestFinancial } = await import("../controllers/paymentsController.ts");
 await reconcilePaymentWebhooks();
 // Retry persisted intent with the same provider idempotency key after a timeout.
 if(!processFinancialOperations)return;
 const operations=await prisma.pagamentos.findMany({where:{gateway:"real",referencia:{not:null},status:{in:["cancelamento_pendente","estorno_pendente"]}},orderBy:{criado_em:"asc"}});
 for(const payment of operations) {
  try {await requestFinancial(payment.id,payment.status==="estorno_pendente"?"refund":"cancel");}
  catch(error) {console.error("Operação financeira continua pendente",payment.id,error instanceof Error?error.message:"Falha no provedor");}
 }
}
