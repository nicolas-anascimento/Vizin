import type { Request, RequestHandler } from "express";
import prisma from "../config/database.ts";
import { HttpError } from "../utils/httpError.ts";
import { parseDateOnly, rentalDays } from "../utils/dates.ts";
import { serializeRental } from "../utils/serializers.ts";
import { nonEmptyString } from "../utils/strings.ts";

export const rentalInclude = {
  itens: {
    include: {
      fotos_item: true,
      categorias: true,
      enderecos: true,
      usuarios: {
        select: {
          id: true,
          nome: true,
          foto_url: true,
          avaliacoes_avaliacoes_avaliado_idTousuarios: { select: { nota: true } },
        },
      },
    },
  },
  usuarios_alugueis_locador_idTousuarios: { select: { id: true, nome: true, email: true, foto_url: true } },
  usuarios_alugueis_locatario_idTousuarios: { select: { id: true, nome: true, email: true, foto_url: true } },
  pagamentos: true,
};

function isParty(rental: { locador_id: string; locatario_id: string }, user: Request["user"]): boolean {
  return Boolean(user && (user.tipo === "admin" || rental.locador_id === user.id || rental.locatario_id === user.id));
}

export const createRentalRequest: RequestHandler = async (req, res) => {
  const itemId = nonEmptyString(req.body?.objeto_id ?? req.body?.item_id);
  const start = parseDateOnly(req.body?.data_retirada ?? req.body?.data_inicio ?? req.body?.retirada, "Data de retirada");
  const end = parseDateOnly(req.body?.data_devolucao ?? req.body?.data_fim ?? req.body?.devolucao, "Data de devolução");
  if (!itemId || !start || !end) throw new HttpError(422, "Objeto e período são obrigatórios");
  const days = rentalDays(start, end);
  if (days < 1) throw new HttpError(422, "A devolução deve ser posterior à retirada");
  if (start < new Date(new Date().toISOString().slice(0, 10))) throw new HttpError(422, "A retirada não pode estar no passado");

  const rental = await prisma.$transaction(async (tx) => {
    const item = await tx.itens.findUnique({
      where: { id: itemId },
      include: { usuarios: { select: { ativo: true } } },
    });
    if (!item || !item.disponivel || item.arquivado || !item.usuarios.ativo) throw new HttpError(404, "Objeto indisponível");
    if (item.usuario_id === req.user!.id) throw new HttpError(409, "Você não pode alugar seu próprio objeto");

    const conflict = await tx.alugueis.findFirst({
      where: {
        item_id: item.id,
        status: { in: ["pendente", "aprovado", "pago", "retirado"] },
        data_inicio: { lte: end },
        data_fim: { gte: start },
      },
    });
    if (conflict) throw new HttpError(409, "O objeto já está reservado nesse período");

    const total = Number(item.preco_por_dia) * days;
    const fee = Number((total * 0.1).toFixed(2));
    const created = await tx.alugueis.create({
      data: {
        item_id: item.id,
        locatario_id: req.user!.id,
        locador_id: item.usuario_id,
        data_inicio: start,
        data_fim: end,
        valor_total: total,
        taxa_plataforma: fee,
        ganho_locador: total - fee,
        status: "pendente",
      },
      include: rentalInclude,
    });
    await tx.notificacoes.create({
      data: {
        usuario_id: item.usuario_id,
        tipo: "solicitacao",
        titulo: "Nova solicitação de aluguel",
        mensagem: `Você recebeu uma solicitação para ${item.titulo}.`,
      },
    });
    return created;
  }, { isolationLevel: "Serializable" });

  res.status(201).json({ success: true, solicitacao_id: rental.id, ...serializeRental(rental) });
};

export const getRentalStatus: RequestHandler = async (req, res) => {
  const rental = await prisma.alugueis.findUnique({ where: { id: req.params.id }, include: rentalInclude });
  if (!rental) throw new HttpError(404, "Solicitação não encontrada");
  if (!isParty(rental, req.user)) throw new HttpError(403, "Acesso negado");
  res.json(serializeRental(rental));
};

export const listMyRentals: RequestHandler = async (req, res) => {
  const where = req.query.tipo === "recebidas" ? { locador_id: req.user!.id } : { locatario_id: req.user!.id };
  const rentals = await prisma.alugueis.findMany({
    where,
    include: rentalInclude,
    orderBy: { criado_em: "desc" },
  });
  res.json(rentals.map(serializeRental));
};

export const updateRentalStatus: RequestHandler = async (req, res) => {
  const status = nonEmptyString(req.body?.status)?.toLowerCase();
  const allowed = ["aprovado", "recusado", "cancelado", "devolvido", "finalizado"];
  if (!status || !allowed.includes(status)) throw new HttpError(422, "Status inválido");
  const rental = await prisma.alugueis.findUnique({ where: { id: req.params.id }, include: { itens: true } });
  if (!rental) throw new HttpError(404, "Solicitação não encontrada");

  const ownerActions = ["aprovado", "recusado", "devolvido", "finalizado"];
  if (ownerActions.includes(status) && rental.locador_id !== req.user!.id && req.user!.tipo !== "admin") {
    throw new HttpError(403, "Apenas o proprietário pode executar esta ação");
  }
  if (status === "cancelado" && rental.locatario_id !== req.user!.id && req.user!.tipo !== "admin") {
    throw new HttpError(403, "Apenas o locatário pode cancelar esta solicitação");
  }

  const transitions: Record<string, string[]> = {
    pendente: ["aprovado", "recusado", "cancelado"],
    aprovado: ["cancelado"],
    retirado: ["devolvido"],
    devolvido: ["finalizado"],
  };
  const currentStatus = rental.status ?? "pendente";
  if (!(transitions[currentStatus] ?? []).includes(status)) {
    throw new HttpError(409, `Não é possível alterar o aluguel de ${currentStatus} para ${status}`);
  }

  const updated = await prisma.$transaction(async (tx) => {
    const changed = await tx.alugueis.updateMany({
      where: { id: rental.id, status: rental.status },
      data: { status, atualizado_em: new Date() },
    });
    if (changed.count === 0) throw new HttpError(409, "O aluguel foi alterado por outra operação");
    const result = await tx.alugueis.findUniqueOrThrow({ where: { id: rental.id }, include: rentalInclude });
    const target = rental.locador_id === req.user!.id ? rental.locatario_id : rental.locador_id;
    await tx.notificacoes.create({
      data: {
        usuario_id: target,
        tipo: "aluguel",
        titulo: "Status do aluguel atualizado",
        mensagem: `O aluguel de ${rental.itens.titulo} está ${status}.`,
      },
    });
    return result;
  });
  res.json({ success: true, ...serializeRental(updated) });
};
