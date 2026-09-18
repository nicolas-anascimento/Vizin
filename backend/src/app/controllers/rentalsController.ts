import { authorizeTransition, normalizeRentalStatus } from "../services/rentalRules.ts";
import { maintainRentals } from "../services/rentalMaintenance.ts";
import { uuid } from "../utils/validation.ts";
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
      avaliacoes: { where: { contexto: "objeto" }, select: { nota: true } },
      categorias: true,
      enderecos: true,
      usuarios: {
        select: {
          id: true,
          nome: true,
          foto_url: true,
          avaliacoes_avaliacoes_avaliado_idTousuarios: { where: { contexto: "objeto" }, select: { nota: true } },
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
  const itemId = nonEmptyString(req.body?.objeto_id ?? req.body?.item_id ?? req.body?.produtoId);
  const start = parseDateOnly(req.body?.data_retirada ?? req.body?.dataRetirada ?? req.body?.data_inicio ?? req.body?.retirada, "Data de retirada");
  const end = parseDateOnly(req.body?.data_devolucao ?? req.body?.dataDevolucao ?? req.body?.data_fim ?? req.body?.devolucao, "Data de devolução");
  if (!itemId || !start || !end) throw new HttpError(422, "Objeto e período são obrigatórios");
  const days = rentalDays(start, end);
  if (days > 365) throw new HttpError(422, "Período máximo de 365 dias");
  if (days < 1) throw new HttpError(422, "A devolução deve ser posterior à retirada");
  if (start < new Date(new Date().toISOString().slice(0, 10))) throw new HttpError(422, "A retirada não pode estar no passado");

  await maintainRentals();
  const rental = await prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM itens WHERE id = ${uuid(itemId)}::uuid FOR UPDATE`;
    await tx.$queryRaw`SELECT id FROM usuarios WHERE id = ${req.user!.id}::uuid FOR UPDATE`;
    const renter = await tx.usuarios.findUniqueOrThrow({ where: { id: req.user!.id } });
    if (!renter.ativo) throw new HttpError(403, "Conta desativada");
    const item = await tx.itens.findUnique({
      where: { id: itemId },
      include: { usuarios: { select: { ativo: true } } },
    });
    if (!item || !item.disponivel || item.arquivado || !item.usuarios.ativo) throw new HttpError(404, "Objeto indisponível");
    if (item.usuario_id === req.user!.id) throw new HttpError(409, "Você não pode alugar seu próprio objeto");

    const today = new Date(new Date().toISOString().slice(0,10));
    if (await tx.alugueis.count({ where: { locatario_id: req.user!.id, status: "retirado", data_fim: { lt: today } } })) throw new HttpError(409, "Você possui devolução em atraso");
    if (await tx.alugueis.count({ where: { item_id: item.id, status: "retirado", data_fim: { lt: today } } })) throw new HttpError(409, "Objeto ainda não foi devolvido");
    const conflict = await tx.alugueis.findFirst({
      where: {
        item_id: item.id,
        status: { in: ["pendente", "aprovado", "pago", "retirado"] },
        data_inicio: { lte: end },
        data_fim: { gte: start },
      },
    });
    if (conflict) throw new HttpError(409, "O objeto já está reservado nesse período");

    const total = Math.round(Number(item.preco_por_dia) * 100) * days / 100;
    if (total > 99999999.99) throw new HttpError(422, "Valor total excede o limite");
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
        expira_em: new Date(Math.min(Date.now() + 48 * 3600000, start.getTime() + 86400000)),
        eventos: { create: { usuario_id: req.user!.id, status: "pendente" } },
      },
      include: rentalInclude,
    });
    await tx.notificacoes.create({
      data: {
        usuario_id: item.usuario_id,
        contexto: { aluguelId: created.id, objetoId: item.id, solicitacaoId: created.id, usuarioId: req.user!.id },
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
  await maintainRentals();
  const rental = await prisma.alugueis.findUnique({ where: { id: uuid(req.params.id) }, include: rentalInclude });
  if (!rental) throw new HttpError(404, "Solicitação não encontrada");
  if (!isParty(rental, req.user)) throw new HttpError(403, "Acesso negado");
  res.json(serializeRental(rental));
};

export const listMyRentals: RequestHandler = async (req, res) => {
  await maintainRentals();
  if ((req.query.proprietarioId && req.query.proprietarioId !== req.user!.id) || (req.query.solicitanteId && req.query.solicitanteId !== req.user!.id)) throw new HttpError(403, "Acesso negado");
  const where = req.query.tipo === "recebidas" || req.query.proprietarioId ? { locador_id: req.user!.id } : req.query.solicitanteId ? { locatario_id: req.user!.id } : { OR: [{ locador_id: req.user!.id }, { locatario_id: req.user!.id }] };
  const rentals = await prisma.alugueis.findMany({
    where,
    include: rentalInclude,
    orderBy: { criado_em: "desc" },
  });
  res.json(rentals.map(serializeRental));
};

export const updateRentalStatus: RequestHandler = async (req, res) => {
  await maintainRentals();
  const input = nonEmptyString(req.body?.status)?.toLowerCase();
  const status = input ? normalizeRentalStatus(input) : null;
  const allowed = ["aprovado", "recusado", "cancelado", "devolvido", "finalizado", "aguardando_devolucao"];
  if (!status || !allowed.includes(status)) throw new HttpError(422, "Status inválido");
  const rental = await prisma.alugueis.findUnique({ where: { id: uuid(req.params.id) }, include: { itens: true } });
  if (!rental) throw new HttpError(404, "Solicitação não encontrada");

  if (status === "aguardando_devolucao") {
    if (![rental.locador_id,rental.locatario_id].includes(req.user!.id)) throw new HttpError(403,"Acesso negado");
    if (rental.status !== "retirado" || !await prisma.devolucoes.findUnique({ where:{aluguel_id_usuario_id:{aluguel_id:rental.id,usuario_id:req.user!.id}} })) throw new HttpError(409,"Registre suas fotos de devolução antes de iniciar esta etapa");
    const current=await prisma.alugueis.findUniqueOrThrow({where:{id:rental.id},include:rentalInclude});
    res.json({success:true,...serializeRental(current)}); return;
  }
  authorizeTransition(rental, req.user!, status);
  const updated = await prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM alugueis WHERE id=${rental.id}::uuid FOR UPDATE`;
    const changed = await tx.alugueis.updateMany({
      where: { id: rental.id, status: rental.status },
      data: { status, atualizado_em: new Date(), ...(status === "aprovado" ? { pagamento_ate: new Date(Math.min(Date.now() + 24*3600000, rental.data_inicio.getTime()+86400000)) } : {}) },
    });
    if (changed.count === 0) throw new HttpError(409, "O aluguel foi alterado por outra operação");
    if (status === "cancelado") {
      if(await tx.pagamentos.count({where:{aluguel_id:rental.id,status:{in:["cancelamento_pendente","estorno_pendente"]}}})) throw new HttpError(409,"Operação financeira pendente");
      if(await tx.pagamentos.count({where:{aluguel_id:rental.id,gateway:{not:"demo"},status:{in:["pago","pendente"]}}})) throw new HttpError(409,"Cancele ou estorne no provedor antes de cancelar aluguel");
      await tx.pagamentos.updateMany({ where: { aluguel_id: rental.id, gateway:"demo",status: "pago" }, data: { status: "estornado" } });
      await tx.pagamentos.updateMany({ where: { aluguel_id: rental.id, gateway:"demo",status: "pendente" }, data: { status: "cancelado" } });
    }
    await tx.eventos_aluguel.create({ data: { aluguel_id: rental.id, usuario_id: req.user!.id, status } });
    const result = await tx.alugueis.findUniqueOrThrow({ where: { id: rental.id }, include: rentalInclude });
    const target = rental.locador_id === req.user!.id ? rental.locatario_id : rental.locador_id;
    await tx.notificacoes.create({
      data: {
        usuario_id: target,
        contexto: { aluguelId: rental.id, objetoId: rental.item_id, solicitacaoId: rental.id },
        tipo: ({aprovado:"aluguel_aprovado",recusado:"aluguel_rejeitado",cancelado:"aluguel_cancelado",finalizado:"devolucao_confirmada"} as Record<string,string>)[status] ?? "aluguel",
        titulo: "Status do aluguel atualizado",
        mensagem: `O aluguel de ${rental.itens.titulo} está ${status}.`,
      },
    });
    return result;
  });
  res.json({ success: true, ...serializeRental(updated) });
};
