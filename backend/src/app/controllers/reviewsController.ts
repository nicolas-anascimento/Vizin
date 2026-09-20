import { text } from "../utils/validation.ts";
import { uuid } from "../utils/validation.ts";
import type { RequestHandler } from "express";
import prisma from "../config/database.ts";
import { serializeReview } from "../utils/serializers.ts";
import { HttpError } from "../utils/httpError.ts";
import { nonEmptyString } from "../utils/strings.ts";
import { pageHeaders, pagination } from "../utils/listPage.ts";

// Valida participante, etapa da locação, contexto e nota antes de criar uma avaliação.
export const createReview: RequestHandler = async (req, res) => {
  const rentalId = nonEmptyString(req.params.id ?? req.body?.aluguel_id);
  const score = Number(req.body?.nota);
  if (!rentalId || !Number.isInteger(score) || score < 1 || score > 5) throw new HttpError(422, "Aluguel e nota de 1 a 5 são obrigatórios");
  const rental = await prisma.alugueis.findUnique({ where: { id: rentalId } });
  if (!rental) throw new HttpError(404, "Aluguel não encontrado");
  if (!["devolvido", "finalizado"].includes(rental.status ?? "")) throw new HttpError(409, "O aluguel precisa estar finalizado");
  if (![rental.locador_id, rental.locatario_id].includes(req.user!.id)) throw new HttpError(403, "Acesso negado");
  if (req.body?.comentario) text(req.body.comentario, "Comentário", 3000);
  const target = req.user!.id === rental.locador_id ? rental.locatario_id : rental.locador_id;
  // Cria avaliação e notificação juntas; a restrição única do banco impede
  // avaliações duplicadas do mesmo autor para o mesmo aluguel.
  const review = await prisma.$transaction(async (tx) => {
    const created = await tx.avaliacoes.create({
      data: { aluguel_id: rental.id, avaliador_id: req.user!.id, avaliado_id: target, contexto: req.user!.id === rental.locatario_id ? "objeto" : "usuario", item_id: req.user!.id === rental.locatario_id ? rental.item_id : null, nota: score, comentario: nonEmptyString(req.body?.comentario) },
    });
    await tx.notificacoes.create({
      data: { contexto: { aluguelId: rental.id, objetoId: rental.item_id }, usuario_id: target, tipo: "avaliacao", titulo: "Nova avaliação", mensagem: `Você recebeu uma avaliação de ${score} estrela${score === 1 ? "" : "s"}.` },
    });
    return created;
  });
  res.status(201).json({ success: true, avaliacao: serializeReview(review) });
};

// Lista avaliações relacionadas a uma solicitação que o usuário pode consultar.
export const listRentalReviews: RequestHandler = async (req, res) => {
 const rental = await prisma.alugueis.findUniqueOrThrow({ where: { id: uuid(req.params.id) } });
 if (![rental.locador_id, rental.locatario_id].includes(req.user!.id)) throw new HttpError(403, "Acesso negado");
 res.json((await prisma.avaliacoes.findMany({ where: { aluguel_id: rental.id }, orderBy: { criado_em: "asc" } })).map(serializeReview));
};

// Pagina avaliações recebidas por um usuário e aplica o DTO público.
export const listReceivedReviews: RequestHandler = async (req, res) => {
  const userId = uuid(req.params.id);
  if (!await prisma.usuarios.findUnique({ where: { id: userId }, select: { id: true } })) throw new HttpError(404, "Usuário não encontrado", "nao_encontrada");
  const { page, limit, skip } = pagination(req);
  const where = { avaliado_id: userId, contexto: req.path.endsWith("-locatario") ? "usuario" : { in: ["usuario", "objeto"] } };
  const [rows, total] = await Promise.all([prisma.avaliacoes.findMany({ where, orderBy: { criado_em: "desc" }, skip, take: limit }), prisma.avaliacoes.count({ where })]);
  pageHeaders(res, total, page, limit);
  res.json(rows.map(serializeReview));
};

// Consulta avaliações públicas de um objeto e seus autores.
export const listItemReviews: RequestHandler = async (req, res) => {
  const itemId = uuid(req.params.id);
  if (!await prisma.itens.findUnique({ where: { id: itemId }, select: { id: true } })) throw new HttpError(404, "Objeto não encontrado", "nao_encontrada");
  const { page, limit, skip } = pagination(req);
  const where = { item_id: itemId, contexto: "objeto" };
  const [rows, total] = await Promise.all([prisma.avaliacoes.findMany({ where, orderBy: { criado_em: "desc" }, skip, take: limit }), prisma.avaliacoes.count({ where })]);
  pageHeaders(res, total, page, limit);
  res.json(rows.map(serializeReview));
};
