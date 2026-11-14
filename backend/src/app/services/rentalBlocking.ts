import prisma from "../config/database.ts";
import { businessDate } from "../utils/dates.ts";
import { HttpError } from "../utils/httpError.ts";

type Reader = Pick<typeof prisma, "alugueis">;

// Somente a pendência operacional de devolução bloqueia nova solicitação. Multas
// financeiras legadas não participam mais das permissões do produto.
export async function currentRentalBlock(db: Reader, userId: string) {
  const overdue = await db.alugueis.findFirst({ where: { locatario_id: userId, status: "retirado", data_fim: { lt: businessDate() } }, orderBy: { data_fim: "asc" }, select: { id: true } });
  if (overdue) return { motivo: "devolucao_pendente", solicitacao_id: overdue.id };
  return null;
}

// Converte o bloqueio encontrado em conflito de negócio com código específico para a API.
export async function assertRentalUnblocked(db: Reader, userId: string) {
  const block = await currentRentalBlock(db, userId);
  if (block) throw new HttpError(409, "Conclua a devolução em atraso", `usuario_com_${block.motivo}`);
}
