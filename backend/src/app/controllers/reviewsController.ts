import type { RequestHandler } from "express";
import prisma from "../config/database.ts";
import { HttpError } from "../utils/httpError.ts";
import { nonEmptyString } from "../utils/strings.ts";

export const createReview: RequestHandler = async (req, res) => {
  const rentalId = nonEmptyString(req.body?.aluguel_id);
  const score = Number(req.body?.nota);
  if (!rentalId || !Number.isInteger(score) || score < 1 || score > 5) throw new HttpError(422, "Aluguel e nota de 1 a 5 são obrigatórios");
  const rental = await prisma.alugueis.findUnique({ where: { id: rentalId } });
  if (!rental) throw new HttpError(404, "Aluguel não encontrado");
  if (!["devolvido", "finalizado"].includes(rental.status ?? "")) throw new HttpError(409, "O aluguel precisa estar finalizado");
  if (![rental.locador_id, rental.locatario_id].includes(req.user!.id)) throw new HttpError(403, "Acesso negado");
  const target = req.user!.id === rental.locador_id ? rental.locatario_id : rental.locador_id;
  const review = await prisma.$transaction(async (tx) => {
    const created = await tx.avaliacoes.create({
      data: { aluguel_id: rental.id, avaliador_id: req.user!.id, avaliado_id: target, nota: score, comentario: nonEmptyString(req.body?.comentario) },
    });
    await tx.notificacoes.create({
      data: { usuario_id: target, tipo: "avaliacao", titulo: "Nova avaliação", mensagem: `Você recebeu uma avaliação de ${score} estrela${score === 1 ? "" : "s"}.` },
    });
    return created;
  });
  res.status(201).json({ success: true, avaliacao: review });
};
