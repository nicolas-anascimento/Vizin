import crypto from "node:crypto";
import prisma from "../config/database.ts";
import { businessDate } from "../utils/dates.ts";
import { createNotifications } from "./notificationPreferences.ts";
import { expireSubscriptions } from "./subscriptionService.ts";

// Manutenção exclusivamente operacional. Cobranças, multas, cancelamentos no
// gateway e estornos de aluguel foram deliberadamente removidos deste job.
export async function maintainRentals(_legacyFinancialFlag = false): Promise<void> {
  const now = new Date();
  const today = businessDate(now);

  // Apenas pedidos ainda não analisados expiram. Uma aprovação não expira por
  // falta de pagamento interno, pois o acordo financeiro ocorre entre usuários.
  const expired = await prisma.alugueis.findMany({ where: { status: "pendente", expira_em: { lte: now } }, select: { id: true }, take: 100 });
  for (const entry of expired) await prisma.$transaction(async tx => {
    await tx.$queryRaw`SELECT id FROM alugueis WHERE id=${entry.id}::uuid FOR UPDATE`;
    const rental = await tx.alugueis.findUniqueOrThrow({ where: { id: entry.id } });
    if (rental.status !== "pendente" || !rental.expira_em || rental.expira_em > now) return;
    await tx.alugueis.update({ where: { id: rental.id }, data: { status: "cancelado", cancelado_por: "sistema", atualizado_em: now } });
    await tx.eventos_aluguel.create({ data: { aluguel_id: rental.id, status: "cancelado", motivo: "Solicitação não analisada no prazo" } });
    await tx.notificacoes.createMany({ skipDuplicates: true, data: [rental.locador_id, rental.locatario_id].map(usuario_id => ({ usuario_id, chave: `${rental.id}:solicitacao_expirada:${usuario_id}`, tipo: "aluguel_cancelado", titulo: "Solicitação expirada", mensagem: "A solicitação não foi analisada no prazo.", contexto: { aluguelId: rental.id, objetoId: rental.item_id, solicitacao_id: rental.id } })) });
  });

  const tomorrow = new Date(today.getTime() + 86400000);
  for (const [date, statuses, event] of [[today,["aprovado","pago"],"retirada_hoje"],[tomorrow,["aprovado","pago"],"retirada_amanha"],[today,["retirado"],"devolucao_hoje"],[tomorrow,["retirado"],"devolucao_amanha"]] as const) {
    const rows = await prisma.alugueis.findMany({ where: { status: { in: [...statuses] }, ...(event.startsWith("retirada") ? { data_inicio: date } : { data_fim: date }) }, select: { id: true, locador_id: true, locatario_id: true }, take: 100 });
    await createNotifications(prisma, rows.flatMap(r => [r.locador_id, r.locatario_id].map(usuario_id => ({ usuario_id, chave: `${r.id}:${event}:${usuario_id}`, tipo: "lembrete", titulo: event.startsWith("retirada") ? "Lembrete de retirada" : "Lembrete de devolução", mensagem: event.endsWith("hoje") ? "A etapa está prevista para hoje." : "A etapa está prevista para amanhã.", contexto: { solicitacao_id: r.id, evento: event } }))), true);
  }

  const late = await prisma.alugueis.findMany({ where: { OR: [{ status: { in: ["aprovado", "pago"] }, data_inicio: { lt: today }, OR: [{ atraso_notificado: null }, { atraso_notificado: { not: "retirada" } }] }, { status: "retirado", data_fim: { lt: today }, OR: [{ atraso_notificado: null }, { atraso_notificado: { not: "devolucao" } }] }] }, take: 100 });
  for (const rental of late) {
    const kind = rental.status === "retirado" ? "devolucao" : "retirada";
    await prisma.$transaction(async tx => {
      const changed = await tx.alugueis.updateMany({ where: { id: rental.id, status: rental.status, atraso_notificado: rental.atraso_notificado }, data: { atraso_notificado: kind } });
      if (!changed.count) return;
      await tx.notificacoes.createMany({ skipDuplicates: true, data: [rental.locador_id, rental.locatario_id].map(usuario_id => ({ usuario_id, chave: `${rental.id}:${kind}_atrasada:${usuario_id}`, tipo: `${kind}_atrasada`, titulo: "Locação em atraso", mensagem: `Existe atraso operacional na ${kind}. Nenhuma cobrança é realizada pelo VIZIN.`, contexto: { solicitacao_id: rental.id, aluguelId: rental.id, objetoId: rental.item_id } })) });
      await tx.notificacoes_admin.create({ data: { tipo: "locacao_atrasada", categoria: "locacoes", prioridade: "alta", titulo: "Locação atrasada", mensagem: `Uma locação está com ${kind} atrasada.`, referencia_tipo: "aluguel", referencia_id: rental.id, chave_deduplicacao: `locacao_atrasada:${rental.id}:${kind}` } });
    });
  }

  // Evidência unilateral continua abrindo ocorrência para suporte, sem afirmar
  // retenção, pagamento ou direito a estorno.
  const unilateral = await prisma.$queryRaw<{id:string}[]>`
    SELECT a.id FROM alugueis a
    WHERE a.status IN ('aprovado','pago') AND a.data_inicio < ${today}
      AND (SELECT COUNT(*) FROM retiradas r WHERE r.aluguel_id=a.id)=1
      AND NOT EXISTS (SELECT 1 FROM denuncias d WHERE d.relato_chave='retirada_evidencia_unilateral:' || a.id::text)
    ORDER BY a.id LIMIT 100`;
  for (const entry of unilateral) await prisma.$transaction(async tx => {
    await tx.$queryRaw`SELECT id FROM alugueis WHERE id=${entry.id}::uuid FOR UPDATE`;
    const rental = await tx.alugueis.findUniqueOrThrow({ where: { id: entry.id }, include: { retiradas: { include: { fotos: true } } } });
    if (!["aprovado", "pago"].includes(rental.status ?? "") || rental.retiradas.length !== 1) return;
    const key = `retirada_evidencia_unilateral:${rental.id}`;
    if (await tx.denuncias.findUnique({ where: { relato_chave: key } })) return;
    const submitter = rental.retiradas[0]!;
    const occurrence = await tx.denuncias.create({ data: { usuario_id: submitter.usuario_id, objeto_id: rental.item_id, aluguel_id: rental.id, etapa: "retirada", relato_chave: key, motivo: "retirada_evidencia_unilateral", assunto: "Retirada com evidência unilateral", mensagem: "Somente uma das partes enviou as fotos dentro da janela combinada. A ocorrência foi encaminhada ao suporte.", evidencias: submitter.fotos.map(photo => photo.url), prioridade: "alta", protocolo: `VIZIN-${now.toISOString().slice(0,10).replaceAll("-","")}-${crypto.randomUUID()}` } });
    await tx.eventos_aluguel.create({ data: { aluguel_id: rental.id, status: rental.status!, motivo: "Retirada com evidência unilateral encaminhada ao suporte" } });
    await tx.notificacoes_admin.create({ data: { tipo: "retirada_evidencia_unilateral", categoria: "denuncias", prioridade: "alta", titulo: "Retirada com evidência unilateral", mensagem: "Somente uma parte enviou fotos no prazo.", referencia_tipo: "ocorrencia", referencia_id: occurrence.id, chave_deduplicacao: key } });
  });

  // A retirada termina no fim do dia civil de São Paulo indicado em data_inicio.
  // A ausência de confirmação operacional libera a reserva no dia seguinte.
  const missedPickups = await prisma.alugueis.findMany({ where: { status: { in: ["aprovado", "pago"] }, data_inicio: { lt: today } }, select: { id: true }, take: 100 });
  for (const entry of missedPickups) await prisma.$transaction(async tx => {
    await tx.$queryRaw`SELECT id FROM alugueis WHERE id=${entry.id}::uuid FOR UPDATE`;
    const rental = await tx.alugueis.findUniqueOrThrow({ where: { id: entry.id } });
    if (!["aprovado", "pago"].includes(rental.status ?? "") || rental.data_inicio >= today) return;
    await tx.alugueis.update({ where: { id: entry.id }, data: { status: "cancelado", cancelado_por: "sistema", atualizado_em: now } });
    await tx.eventos_aluguel.create({ data: { aluguel_id: entry.id, status: "cancelado", motivo: "Prazo de retirada encerrado sem confirmação operacional" } });
    await tx.notificacoes.createMany({ skipDuplicates: true, data: [rental.locador_id, rental.locatario_id].map(usuario_id => ({ usuario_id, chave: `${entry.id}:retirada_prazo_expirado:${usuario_id}`, tipo: "aluguel_cancelado", titulo: "Prazo de retirada encerrado", mensagem: "A reserva foi cancelada porque a retirada não foi confirmada no dia combinado. Nenhuma cobrança ou estorno é feito pelo VIZIN.", contexto: { aluguelId: entry.id, objetoId: rental.item_id, solicitacao_id: entry.id } })) });
  });

  await expireSubscriptions(now);
}
