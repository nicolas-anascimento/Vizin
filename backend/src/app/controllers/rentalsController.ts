import { audit } from "../utils/admin.ts";
import { paymentDeadline, rentalPrice } from "../services/paymentRules.ts";
import { authorizeTransition, normalizeRentalStatus } from "../services/rentalRules.ts";
import { maintainRentals } from "../services/rentalMaintenance.ts";
import { uuid } from "../utils/validation.ts";
import type { Request, RequestHandler } from "express";
import prisma from "../config/database.ts";
import { HttpError } from "../utils/httpError.ts";
import { businessDate, parseDateOnly, rentalDays } from "../utils/dates.ts";
import { serializeRental } from "../utils/serializers.ts";
import { nonEmptyString } from "../utils/strings.ts";
import { pageHeaders, pagination } from "../utils/listPage.ts";
import { assertRentalUnblocked, currentRentalBlock } from "../services/rentalBlocking.ts";
import { requestFinancial } from "./paymentsController.ts";
import { createNotification, createNotifications } from "../services/notificationPreferences.ts";

// Reúne as relações necessárias para montar o DTO da solicitação, incluindo objeto, participantes, pagamentos e multa.
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
          ativo: true,
          avaliacoes_avaliacoes_avaliado_idTousuarios: { where: { contexto: "objeto" }, select: { nota: true } },
        },
      },
    },
  },
  usuarios_alugueis_locador_idTousuarios: { select: { id: true, nome: true, email: true, foto_url: true } },
  usuarios_alugueis_locatario_idTousuarios: { select: { id: true, nome: true, email: true, foto_url: true } },
  pagamentos: { select: { tipo: true, status: true } },
  multa: true,
};

function isParty(rental: { locador_id: string; locatario_id: string }, user: Request["user"]): boolean {
  return Boolean(user && (user.tipo === "admin" || rental.locador_id === user.id || rental.locatario_id === user.id));
}

/*
 * Recebe o objeto e as datas em formatos aceitos pelas rotas atuais e legadas.
 * Valida o período no calendário comercial e calcula o preço no servidor a partir
 * do valor cadastrado no objeto; o cliente não define o total contratado.
 */
export const createRentalRequest: RequestHandler = async (req, res) => {
  const itemId = nonEmptyString(req.body?.produto_id ?? req.body?.objeto_id ?? req.body?.item_id ?? req.body?.produtoId);
  const start = parseDateOnly(req.body?.data_retirada ?? req.body?.dataRetirada ?? req.body?.data_inicio ?? req.body?.retirada, "Data de retirada");
  const end = parseDateOnly(req.body?.data_devolucao ?? req.body?.dataDevolucao ?? req.body?.data_fim ?? req.body?.devolucao, "Data de devolução");
  if (!itemId || !start || !end) throw new HttpError(422, "Objeto e período são obrigatórios");
  const days = rentalDays(start, end);
  if (days > 365) throw new HttpError(422, "Período máximo de 365 dias");
  if (days < 1) throw new HttpError(422, "A devolução deve ser posterior à retirada");
  if (start < businessDate()) throw new HttpError(422, "A retirada não pode estar no passado");

  // Antes de criar, encerra solicitações vencidas para que não ocupem o período indevidamente.
  // A transação serializável protege as verificações e a criação contra pedidos concorrentes.
  await maintainRentals();
  const rental = await prisma.$transaction(async (tx) => {
    // Bloqueia o objeto e o locatário durante a consulta de disponibilidade e dos impedimentos.
    // Assim, outra criação ou mudança concorrente não decide sobre o mesmo estado anterior.
    await tx.$queryRaw`SELECT id FROM itens WHERE id = ${uuid(itemId)}::uuid FOR UPDATE`;
    await tx.$queryRaw`SELECT id FROM usuarios WHERE id = ${req.user!.id}::uuid FOR UPDATE`;
    const renter = await tx.usuarios.findUniqueOrThrow({ where: { id: req.user!.id } });
    if (!renter.ativo) throw new HttpError(403, "Conta desativada");
    await assertRentalUnblocked(tx, req.user!.id);
    const item = await tx.itens.findUnique({
      where: { id: itemId },
      include: { usuarios: { select: { ativo: true } } },
    });
    if (!item || !item.disponivel || item.arquivado || !item.usuarios.ativo) throw new HttpError(404, "Objeto indisponível");
    if (item.usuario_id === req.user!.id) throw new HttpError(409, "Você não pode alugar seu próprio objeto");

    const today = businessDate();
    // Impede novo aluguel enquanto existe retirada vencida, pedido pendente do mesmo usuário
    // ou reserva aprovada que se sobrepõe ao intervalo solicitado.
    if (await tx.alugueis.count({ where: { item_id: item.id, status: "retirado", data_fim: { lt: today } } })) throw new HttpError(409, "Objeto ainda não foi devolvido");
    if (await tx.alugueis.count({ where: { item_id: item.id, locatario_id: req.user!.id, status: "pendente" } })) throw new HttpError(409, "Você já possui solicitação pendente para este objeto", "solicitacao_duplicada");
    const conflict = await tx.alugueis.findFirst({
      where: {
        item_id: item.id,
        status: { in: ["aprovado", "pago", "retirado"] },
        data_inicio: { lte: end },
        data_fim: { gte: start },
      },
    });
    if (conflict) throw new HttpError(409, "O objeto já está reservado nesse período");

// Congela preço diário, subtotal e taxa na solicitação e registra o evento inicial.
    // O prazo de expiração é limitado também pelo início do dia seguinte à retirada.

    const price = rentalPrice(Number(item.preco_por_dia), days);
    if (price.subtotal > 99999999.99) throw new HttpError(422, "Valor total excede o limite");
    const created = await tx.alugueis.create({
      data: {
        item_id: item.id,
        locatario_id: req.user!.id,
        locador_id: item.usuario_id,
        data_inicio: start,
        data_fim: end,
        valor_total: price.subtotal,
        preco_dia_contratado: item.preco_por_dia,
        taxa_plataforma: price.taxa_servico,
        ganho_locador: price.subtotal,
        status: "pendente",
        expira_em: new Date(Math.min(Date.now() + 48 * 3600000, paymentDeadline({data_inicio:start}).getTime())),
        eventos: { create: { usuario_id: req.user!.id, status: "pendente" } },
      },
      include: rentalInclude,
    });
    // A notificação ao proprietário é criada na mesma transação: só existe se a solicitação existir.
    await createNotification(tx, {
        usuario_id: item.usuario_id,
        contexto: { aluguelId: created.id, objetoId: item.id, solicitacaoId: created.id, usuarioId: req.user!.id },
        tipo: "solicitacao",
        titulo: "Nova solicitação de aluguel",
        mensagem: `Você recebeu uma solicitação para ${item.titulo}.`,
    });
    return created;
  }, { isolationLevel: "Serializable" });

  res.status(201).json({ success: true, solicitacao_id: rental.id, ...serializeRental(rental) });
};

// Consulta uma solicitação pelo UUID e só expõe o DTO a participante ou administrador.
export const getRentalStatus: RequestHandler = async (req, res) => {
  await maintainRentals();
  const rental = await prisma.alugueis.findUnique({ where: { id: uuid(req.params.id) }, include: rentalInclude });
  if (!rental) throw new HttpError(404, "Solicitação não encontrada");
  if (!isParty(rental, req.user)) throw new HttpError(403, "Acesso negado");
  res.json(serializeRental(rental));
};

// Aplica filtros de papel apenas sobre registros do usuário autenticado e devolve a lista paginada.
export const listMyRentals: RequestHandler = async (req, res) => {
  await maintainRentals();
  if ((req.query.proprietarioId && req.query.proprietarioId !== req.user!.id) || (req.query.solicitanteId && req.query.solicitanteId !== req.user!.id)) throw new HttpError(403, "Acesso negado");
  const role = req.query.papel;
  if (role !== undefined && role !== "locatario" && role !== "proprietario") throw new HttpError(422, "Papel inválido", "papel_invalido");
  if ((role === "locatario" && (req.query.proprietarioId || req.query.tipo === "recebidas")) || (role === "proprietario" && req.query.solicitanteId)) throw new HttpError(422, "Filtros de papel incompatíveis", "papel_invalido");
  const where = role === "proprietario" || req.query.tipo === "recebidas" || req.query.proprietarioId ? { locador_id: req.user!.id } : role === "locatario" || req.query.solicitanteId ? { locatario_id: req.user!.id } : { OR: [{ locador_id: req.user!.id }, { locatario_id: req.user!.id }] };
  const {page,limit,skip}=pagination(req);
  const [rentals,total] = await Promise.all([prisma.alugueis.findMany({
    where,
    include: rentalInclude,
    orderBy: { criado_em: "desc" },
    skip,take:limit,
  }),prisma.alugueis.count({where})]);
  pageHeaders(res,total,page,limit);
  res.json(rentals.map(serializeRental));
};

/*
 * Controla aprovação, rejeição, cancelamento e finalização conforme papel e estado atual.
 * Na aprovação, o bloqueio do objeto, a busca por conflitos e a atualização condicional
 * evitam que duas solicitações para o mesmo período sejam aprovadas simultaneamente.
 */
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
    if (status === "aprovado") {
      await tx.$queryRaw`SELECT id FROM itens WHERE id=${rental.item_id}::uuid FOR UPDATE`;
      await assertRentalUnblocked(tx, req.user!.id);
    }
    await tx.$queryRaw`SELECT id FROM alugueis WHERE id=${rental.id}::uuid FOR UPDATE`;
    if (status === "aprovado") {
      const competing = await tx.alugueis.findFirst({ where: { item_id: rental.item_id, id: { not: rental.id }, status: { in: ["aprovado", "pago", "retirado"] }, data_inicio: { lte: rental.data_fim }, data_fim: { gte: rental.data_inicio } }, select: { id: true } });
      if (competing) throw new HttpError(409, "Objeto já reservado no período", "objeto_indisponivel");
    }
    const changed = await tx.alugueis.updateMany({
      where: { id: rental.id, status: rental.status },
      data: { status, atualizado_em: new Date(), ...(status === "aprovado" ? { pagamento_ate: paymentDeadline(rental) } : {}), ...(status === "cancelado" ? { cancelado_por: req.baseUrl.startsWith("/api/admin") ? "admin" : req.user!.id } : {}) },
    });
    if (changed.count === 0) throw new HttpError(409, "O aluguel foi alterado por outra operação");
    // Ao aprovar uma reserva, recusa pedidos pendentes conflitantes e avisa seus locatários.
    if (status === "aprovado") {
      const pending = await tx.alugueis.findMany({ where: { item_id: rental.item_id, id: { not: rental.id }, status: "pendente", data_inicio: { lte: rental.data_fim }, data_fim: { gte: rental.data_inicio } }, select: { id: true, locatario_id: true } });
      if (pending.length) {
        await tx.alugueis.updateMany({ where: { id: { in: pending.map(row => row.id) }, status: "pendente" }, data: { status: "recusado", atualizado_em: new Date() } });
        await tx.eventos_aluguel.createMany({ data: pending.map(row => ({ aluguel_id: row.id, status: "recusado", motivo: "Conflito com solicitação aprovada" })) });
        await createNotifications(tx, pending.map(row => ({ usuario_id: row.locatario_id, tipo: "aluguel_rejeitado", titulo: "Solicitação não aprovada", mensagem: "O objeto foi reservado para o mesmo período.", contexto: { solicitacao_id: row.id, aluguelId: row.id } })));
      }
    }
    // Pagamentos reais devem ser resolvidos no provedor antes de concluir o cancelamento local.
    if (status === "cancelado") {
      if(await tx.pagamentos.count({where:{aluguel_id:rental.id,status:{in:["cancelamento_pendente","estorno_pendente"]}}})) throw new HttpError(409,"Operação financeira pendente");
      if(await tx.pagamentos.count({where:{aluguel_id:rental.id,gateway:{not:"demo"},status:{in:["pago","pendente"]}}})) throw new HttpError(409,"Cancele ou estorne no provedor antes de cancelar aluguel");
      await tx.pagamentos.updateMany({ where: { aluguel_id: rental.id, gateway:"demo",status: "pago" }, data: { status: "estornado" } });
      await tx.pagamentos.updateMany({ where: { aluguel_id: rental.id, gateway:"demo",status: "pendente" }, data: { status: "cancelado" } });
    }
    await tx.eventos_aluguel.create({ data: { aluguel_id: rental.id, usuario_id: req.user!.id, status } });
    if (req.baseUrl.startsWith("/api/admin")) await audit(tx, req.user!.id, "alterar_status", "aluguel", rental.id, { status });
    const result = await tx.alugueis.findUniqueOrThrow({ where: { id: rental.id }, include: rentalInclude });
    const target = rental.locador_id === req.user!.id ? rental.locatario_id : rental.locador_id;
    await createNotification(tx, {
        usuario_id: target,
        contexto: { aluguelId: rental.id, objetoId: rental.item_id, solicitacaoId: rental.id },
        tipo: ({aprovado:"aluguel_aprovado",recusado:"aluguel_rejeitado",cancelado:"aluguel_cancelado",finalizado:"devolucao_confirmada"} as Record<string,string>)[status] ?? "aluguel",
        titulo: "Status do aluguel atualizado",
        mensagem: `O aluguel de ${rental.itens.titulo} está ${status}.`,
    });
    return result;
  });
  res.json({ success: true, ...serializeRental(updated) });
};

// Informa ao frontend se multa pendente ou devolução atrasada impede nova solicitação.
export const getMyRentalBlock: RequestHandler = async (req, res) => {
  res.json(await currentRentalBlock(prisma, req.user!.id));
};

/*
 * Cancela pedido do locatário ou proprietário conforme o estado atual.
 * Se houver cobrança, solicita antes o cancelamento ou estorno financeiro; uma resposta
 * 202 indica que essa operação ainda precisa ser confirmada pelo provedor.
 */
export const cancelRentalRequest: RequestHandler = async (req, res) => {
  const id = uuid(req.params.id);
  const rental = await prisma.alugueis.findUnique({ where: { id } });
  if (!rental) throw new HttpError(404, "Solicitação não encontrada", "nao_encontrada");
  if (![rental.locatario_id, rental.locador_id].includes(req.user!.id)) throw new HttpError(403, "Acesso negado", "nao_pertence");
  if (rental.status === "cancelado") { res.json({ success: true, status: "cancelado", solicitacao_id: id }); return; }
  if (!["pendente", "aprovado", "pago"].includes(rental.status ?? "")) throw new HttpError(409, "Cancelamento não permitido neste estado", "cancelamento_indisponivel");
  await prisma.alugueis.updateMany({ where: { id, status: rental.status }, data: { cancelado_por: req.user!.id } });
  const financial = await prisma.pagamentos.findFirst({ where: { aluguel_id: id, tipo: "aluguel", status: { in: ["pago", "pendente", "estorno_pendente", "cancelamento_pendente"] } }, orderBy: { criado_em: "desc" } });
  if (financial) {
    const payment = await requestFinancial(financial.id, financial.status === "pago" || financial.status === "estorno_pendente" ? "refund" : "cancel");
    if (payment.status === "estorno_pendente" || payment.status === "cancelamento_pendente") { res.status(202).json({ success: true, status: "operacao_financeira_pendente", solicitacao_id: id }); return; }
  }
  // Só marca o aluguel como cancelado e registra evento e avisos após resolver o pagamento.
  // O bloqueio e a releitura evitam duplicar o evento em cancelamentos concorrentes.
  const result = await prisma.$transaction(async tx => {
    await tx.$queryRaw`SELECT id FROM alugueis WHERE id=${id}::uuid FOR UPDATE`;
    const row = await tx.alugueis.findUniqueOrThrow({ where: { id } });
    if (row.status !== "cancelado") {
      await tx.alugueis.update({ where: { id }, data: { status: "cancelado", cancelado_por: req.user!.id, atualizado_em: new Date() } });
      await tx.eventos_aluguel.create({ data: { aluguel_id: id, usuario_id: req.user!.id, status: "cancelado" } });
    }
    await tx.notificacoes.createMany({ skipDuplicates: true, data: [row.locador_id, row.locatario_id].map(usuario_id => ({ usuario_id, chave: `${id}:cancelamento:${usuario_id}`, tipo: "aluguel_cancelado", titulo: "Solicitação cancelada", mensagem: "A solicitação foi cancelada.", contexto: { solicitacao_id: id, aluguelId: id } })) });
    return tx.alugueis.findUniqueOrThrow({ where: { id }, include: rentalInclude });
  });
  res.json({ success: true, ...serializeRental(result) });
};
