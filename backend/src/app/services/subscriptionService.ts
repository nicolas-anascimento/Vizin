import prisma from "../config/database.ts";

export const PLAN_CODES = ["gratuito", "intermediario", "avancado"] as const;
export type PlanCode = typeof PLAN_CODES[number];

export function addUtcMonth(value: Date): Date {
  const year = value.getUTCFullYear();
  const month = value.getUTCMonth();
  const day = value.getUTCDate();
  const lastDay = new Date(Date.UTC(year, month + 2, 0)).getUTCDate();
  return new Date(Date.UTC(year, month + 1, Math.min(day, lastDay), value.getUTCHours(), value.getUTCMinutes(), value.getUTCSeconds(), value.getUTCMilliseconds()));
}

export function freePeriod(now = new Date()): { inicio: Date; fim: Date } {
  return {
    inicio: new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)),
    fim: new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1)),
  };
}

// O vencimento é aplicado tanto pelo job quanto nas leituras críticas. A chave da
// notificação torna a operação segura quando mais de um processo encontra a linha.
export async function expireSubscriptions(now = new Date()): Promise<number> {
  const due = await prisma.assinaturas.findMany({
    where: {
      status: "ativa",
      fim: { lte: now },
      planos: { codigo: { in: [...PLAN_CODES] } },
    },
    select: { id: true, usuario_id: true },
    take: 100,
  });
  let expired = 0;
  for (const row of due) {
    await prisma.$transaction(async tx => {
      await tx.$queryRaw`SELECT id FROM assinaturas WHERE id=${row.id}::uuid FOR UPDATE`;
      const changed = await tx.assinaturas.updateMany({
        where: { id: row.id, status: "ativa", fim: { lte: now } },
        data: { status: "expirada", renovacao_habilitada: false, proxima_cobranca: null },
      });
      if (!changed.count) return;
      expired += 1;
      await tx.notificacoes.createMany({ skipDuplicates: true, data: [{
        usuario_id: row.usuario_id,
        chave: `assinatura_expirada:${row.id}`,
        tipo: "assinatura_expirada",
        titulo: "Plano pago encerrado",
        mensagem: "Seu período pago terminou. Novas publicações seguem agora o plano Gratuito; anúncios existentes foram preservados.",
        contexto: { assinatura_id: row.id },
      }] });
    });
  }
  return expired;
}

export async function publicationContext(userId: string, now = new Date(), db: any = prisma) {
  const subscription = await db.assinaturas.findFirst({
    where: {
      usuario_id: userId,
      status: "ativa",
      inicio: { lte: now },
      fim: { gt: now },
      planos: { codigo: { in: [...PLAN_CODES] } },
    },
    include: { planos: true },
    orderBy: { inicio: "desc" },
  });
  const free = subscription ? null : await db.planos.findUnique({ where: { codigo: "gratuito" } });
  const plan = subscription?.planos ?? free;
  if (!plan) throw new Error("Plano gratuito não cadastrado; aplique as migrations");
  const period = subscription
    ? { inicio: subscription.inicio, fim: subscription.fim! }
    : freePeriod(now);
  const utilizadas = await db.publicacoes_anuncio.count({
    where: subscription
      ? { usuario_id: userId, assinatura_id: subscription.id }
      : { usuario_id: userId, assinatura_id: null, periodo_inicio: period.inicio, periodo_fim: period.fim },
  });
  return {
    plano: plan,
    assinatura: subscription,
    periodo: period,
    utilizadas,
    disponiveis: Math.max(0, plan.limite_publicacoes - utilizadas),
  };
}

export function subscriptionDto(context: Awaited<ReturnType<typeof publicationContext>>) {
  const { plano, assinatura, periodo, utilizadas, disponiveis } = context;
  return {
    plano: {
      id: plano.id,
      codigo: plano.codigo,
      nome: plano.nome,
      preco_centavos: plano.preco_centavos,
      preco_mensal: plano.preco_centavos / 100,
      limite_publicacoes: plano.limite_publicacoes,
      status: plano.ativo ? "ativo" : "inativo",
    },
    assinatura: assinatura ? {
      id: assinatura.id,
      status: assinatura.status,
      inicio_periodo: assinatura.inicio,
      fim_periodo: assinatura.fim,
      cancelar_ao_final: assinatura.cancelar_ao_final,
      renovacao_habilitada: assinatura.renovacao_habilitada,
      proxima_cobranca: assinatura.proxima_cobranca,
    } : {
      id: null,
      status: "gratuita",
      inicio_periodo: periodo.inicio,
      fim_periodo: periodo.fim,
      cancelar_ao_final: false,
      renovacao_habilitada: false,
      proxima_cobranca: null,
    },
    publicacoes: {
      limite: plano.limite_publicacoes,
      utilizadas,
      disponiveis,
      periodo_inicio: periodo.inicio,
      periodo_fim: periodo.fim,
    },
    anuncios_usados: utilizadas,
  };
}
