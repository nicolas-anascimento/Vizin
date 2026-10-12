import prisma from "../config/database.ts";
import { publishNotification } from "../../realtime/realtimeService.ts";
import { serializeNotification } from "../utils/serializers.ts";

export const campaignSegments = ["todos", "ativos", "proprietarios", "locatarios", "novos"] as const;
export type CampaignSegment = typeof campaignSegments[number];

export function campaignAudienceWhere(segment: CampaignSegment): any {
  const active = segment !== "todos" ? { ativo: true } : {};
  if (segment === "proprietarios") return { ...active, itens: { some: { arquivado: false } } };
  if (segment === "locatarios") return { ...active, alugueis_alugueis_locatario_idTousuarios: { some: {} } };
  if (segment === "novos") return { ...active, criado_em: { gte: new Date(Date.now() - 30 * 86400000) } };
  return active;
}

export async function processAdminCampaigns(): Promise<void> {
  const now = new Date();
  const candidates = await prisma.comunicados_admin.findMany({
    where: { AND: [{ OR: [{ status: "enviando" }, { status: "agendada", agendada_para: { lte: now } }] }, { OR: [{ lease_ate: null }, { lease_ate: { lt: now } }] }] },
    orderBy: { criado_em: "asc" }, take: 10,
  });
  for (const candidate of candidates) {
    const lease = new Date(Date.now() + 2 * 60_000);
    const claimed = await prisma.comunicados_admin.updateMany({ where: { id: candidate.id, status: { in: ["enviando", "agendada"] }, OR: [{ lease_ate: null }, { lease_ate: { lt: now } }] }, data: { status: "enviando", lease_ate: lease, tentativas: { increment: 1 }, erro_envio: null } });
    if (!claimed.count) continue;
    try {
      let cursor: string | undefined;
      let delivered = 0;
      while (true) {
        const users = await prisma.usuarios.findMany({ where: campaignAudienceWhere(candidate.destinatarios as CampaignSegment), select: { id: true }, orderBy: { id: "asc" }, take: 100, ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}) });
        if (!users.length) break;
        for (const user of users) {
          const notification = await prisma.$transaction(async tx => {
            const inserted = await tx.comunicados_admin_entregas.createMany({ data: [{ comunicado_id: candidate.id, usuario_id: user.id }], skipDuplicates: true });
            if (!inserted.count) return null;
            const notification = await tx.notificacoes.create({ data: { usuario_id: user.id, chave: `comunicado:${candidate.id}:${user.id}`, tipo: "comunicado_admin", titulo: candidate.titulo, mensagem: candidate.mensagem, contexto: { comunicado_id: candidate.id } } });
            await tx.comunicados_admin_entregas.update({ where: { comunicado_id_usuario_id: { comunicado_id: candidate.id, usuario_id: user.id } }, data: { notificacao_id: notification.id, entregue_em: new Date() } });
            return notification;
          });
          if (notification) {
            delivered++;
            publishNotification(user.id, serializeNotification(notification));
          }
        }
        cursor = users[users.length - 1]!.id;
        if (users.length < 100) break;
        await prisma.comunicados_admin.update({ where: { id: candidate.id }, data: { lease_ate: new Date(Date.now() + 2 * 60_000) } });
      }
      const total = await prisma.comunicados_admin_entregas.count({ where: { comunicado_id: candidate.id, entregue_em: { not: null } } });
      await prisma.$transaction(async tx => {
        await tx.comunicados_admin.update({ where: { id: candidate.id }, data: { status: "enviada", enviada_em: new Date(), total_destinatarios: total, lease_ate: null } });
        await tx.admin_auditoria.create({ data: { admin_id: candidate.criado_por_id, acao: "notificacao_enviada", entidade: "comunicado", entidade_id: candidate.id, metadata: { total_destinatarios: total, novas_entregas: delivered } } });
      });
    } catch (error) {
      await prisma.comunicados_admin.update({ where: { id: candidate.id }, data: { status: "falhou", lease_ate: null, erro_envio: error instanceof Error ? error.message.slice(0, 500) : "Falha no processamento" } });
    }
  }
}
