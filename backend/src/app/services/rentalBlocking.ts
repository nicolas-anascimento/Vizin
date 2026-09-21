import prisma from "../config/database.ts";
import { businessDate } from "../utils/dates.ts";
import { HttpError } from "../utils/httpError.ts";

type Reader = Pick<typeof prisma, "alugueis" | "multas_aluguel">;

// Procura primeiro multa pendente e depois aluguel retirado com devolução vencida.
// Esses dois casos impedem o locatário de criar novas solicitações.
export async function currentRentalBlock(db: Reader, userId: string) {
  const pendingFine = await db.multas_aluguel.findFirst({ where: { status: "pendente", aluguel: { locatario_id: userId } }, orderBy: { calculado_em: "asc" }, select: { aluguel_id: true } });
  if (pendingFine) return { motivo: "multa_pendente", solicitacao_id: pendingFine.aluguel_id };
  const overdue = await db.alugueis.findFirst({ where: { locatario_id: userId, status: "retirado", data_fim: { lt: businessDate() } }, orderBy: { data_fim: "asc" }, select: { id: true } });
  if (overdue) return { motivo: "devolucao_pendente", solicitacao_id: overdue.id };
  return null;
}

// Converte o bloqueio encontrado em conflito de negócio com código específico para a API.
export async function assertRentalUnblocked(db: Reader, userId: string) {
  const block = await currentRentalBlock(db, userId);
  if (block) throw new HttpError(409, block.motivo === "multa_pendente" ? "Pague ou conteste a multa pendente" : "Conclua a devolução em atraso", `usuario_com_${block.motivo}`);
}
