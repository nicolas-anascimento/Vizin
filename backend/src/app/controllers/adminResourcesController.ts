import type { RequestHandler } from "express";
import prisma from "../config/database.ts";
import { text, uuid, slug } from "../utils/validation.ts";
import { HttpError } from "../utils/httpError.ts";
import { serializeReview } from "../utils/serializers.ts";
import { audit, dateFilters, paged, pagination, statusFilter } from "../utils/admin.ts";
import { businessDate, businessDayStart } from "../utils/dates.ts";

// DTO financeiro do painel, sem dados sensíveis do meio de pagamento.
function paymentDto(p: any) {
  return {
    id: p.id, aluguel_id: p.aluguel_id, valor: Number(p.valor), metodo: p.metodo,
    status: p.status, pago_em: p.pago_em, referencia: p.referencia, tipo: p.tipo,
    gateway: p.gateway, criado_em: p.criado_em,
    ...(p.alugueis ? {
      usuario: p.alugueis.usuarios_alugueis_locatario_idTousuarios,
      produto: p.alugueis.itens,
    } : {}),
  };
}
const paymentSelect = {
  id: true, aluguel_id: true, valor: true, metodo: true, status: true,
  pago_em: true, referencia: true, tipo: true, gateway: true, criado_em: true,
  alugueis: { select: {
    usuarios_alugueis_locatario_idTousuarios: { select: { id: true, nome: true } },
    itens: { select: { id: true, titulo: true } },
  } },
} as const;
// Filtra e pagina cobranças para acompanhamento administrativo.
export const adminPayments: RequestHandler = async (req, res) => {
  const { page, limit, skip } = pagination(req);
  const status=statusFilter(req,["pendente","pago","falhou","cancelado","estornado","cancelamento_pendente","estorno_pendente","conciliacao","expirado"]);
  const busca = typeof req.query.busca === "string" && req.query.busca.trim() ? text(req.query.busca, "Busca", 100) : undefined;
  const buscaUuid = busca && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(busca) ? busca : undefined;
  const where = {
    ...(status ? { status } : {}),
    ...(busca ? { OR: [
      ...(buscaUuid ? [{ id: buscaUuid }] : []),
      { referencia: { contains: busca, mode: "insensitive" as const } },
      { metodo: { contains: busca, mode: "insensitive" as const } },
      { alugueis: { usuarios_alugueis_locatario_idTousuarios: { nome: { contains: busca, mode: "insensitive" as const } } } },
      { alugueis: { itens: { titulo: { contains: busca, mode: "insensitive" as const } } } },
    ] } : {}),
  };
  const [rows, total] = await Promise.all([prisma.pagamentos.findMany({ where, skip, take: limit, orderBy: { criado_em: "desc" }, select: paymentSelect }), prisma.pagamentos.count({ where })]);
  res.json(paged(rows.map(paymentDto), total, page, limit));
};
// Detalha uma cobrança para análise administrativa.
export const adminPayment: RequestHandler = async (req, res) => {
  const payment = await prisma.pagamentos.findUnique({ where: { id: uuid(req.params.id) }, select: paymentSelect });
  if (!payment) throw new HttpError(404, "Pagamento não encontrado", "nao_encontrada");
  res.json(paymentDto(payment));
};
// Agrega exatamente os indicadores exibidos pela tela financeira administrativa.
export const adminPaymentStats: RequestHandler = async (_req, res) => {
  const today = businessDate();
  const currentMonth = businessDayStart(new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), 1)));
  const nextMonth = businessDayStart(new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() + 1, 1)));
  const previousMonth = businessDayStart(new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() - 1, 1)));
  const monthRanges = Array.from({ length: 6 }, (_, index) => {
    const offset = index - 5;
    const labelDate = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() + offset, 1));
    return {
      mes: `${labelDate.getUTCFullYear()}-${String(labelDate.getUTCMonth() + 1).padStart(2, "0")}`,
      start: businessDayStart(labelDate),
      end: businessDayStart(new Date(Date.UTC(labelDate.getUTCFullYear(), labelDate.getUTCMonth() + 1, 1))),
    };
  });
  const [total, pending, failed, current, previous, methods, ...months] = await Promise.all([
    prisma.pagamentos.aggregate({ where: { status: "pago" }, _sum: { valor: true } }),
    prisma.pagamentos.count({ where: { status: "pendente" } }),
    prisma.pagamentos.count({ where: { status: "falhou" } }),
    prisma.pagamentos.aggregate({ where: { status: "pago", pago_em: { gte: currentMonth, lt: nextMonth } }, _sum: { valor: true } }),
    prisma.pagamentos.aggregate({ where: { status: "pago", pago_em: { gte: previousMonth, lt: currentMonth } }, _sum: { valor: true } }),
    prisma.pagamentos.groupBy({ by: ["metodo"], where: { status: "pago" }, _sum: { valor: true } }),
    ...monthRanges.map(range => prisma.pagamentos.aggregate({ where: { status: "pago", pago_em: { gte: range.start, lt: range.end } }, _sum: { valor: true } })),
  ]);
  const currentValue = Number(current._sum.valor ?? 0);
  const previousValue = Number(previous._sum.valor ?? 0);
  res.json({
    receita_total: Number(total._sum.valor ?? 0),
    receita_variacao_percentual: previousValue > 0 ? ((currentValue - previousValue) / previousValue) * 100 : null,
    pagamentos_pendentes: pending,
    transacoes_falhadas: failed,
    receita_mensal: monthRanges.map((range, index) => ({ mes: range.mes, valor: Number(months[index]!._sum.valor ?? 0) })),
    metodos: methods.filter(row => row.metodo).map(row => ({ metodo: row.metodo, total: Number(row._sum.valor ?? 0) })),
    timezone: "America/Sao_Paulo",
    receita_base: "pago_em",
  });
};
// Lista avaliações para moderação.
export const adminReviews: RequestHandler = async (req, res) => {
  const { page, limit, skip } = pagination(req);
  const range = dateFilters(req); const where = { ...(range ? { criado_em: range } : {}) };
  const [rows, total] = await Promise.all([prisma.avaliacoes.findMany({ where, skip, take: limit, orderBy: { criado_em: "desc" } }), prisma.avaliacoes.count({ where })]);
  res.json(paged(rows.map(serializeReview), total, page, limit));
};
// Remove avaliação indicada e registra a ação administrativa.
export const removeReview: RequestHandler = async (req, res) => {
  const id = uuid(req.params.id);
  await prisma.$transaction(async tx => { await tx.avaliacoes.delete({ where: { id } }); await audit(tx, req.user!.id, "remover", "avaliacao", id); });
  res.json({ success: true });
};
// Cria listagem paginada para suporte, denúncias ou sinistros.
export function listCases(kind: "suporte" | "denuncia" | "sinistro"): RequestHandler { return async (req, res) => {
  const { page, limit, skip } = pagination(req);
  const status = statusFilter(req,kind==="suporte"?["aberto","em_analise","respondido","fechado"]:kind==="denuncia"?["aberta","em_analise","procedente","improcedente","fechada"]:["aberto","em_analise","aprovado","rejeitado","fechado"]);
  const busca = typeof req.query.busca === "string" && req.query.busca.trim() ? text(req.query.busca, "Busca", 100) : undefined;
  const range = dateFilters(req);
  const order = req.query.ordenacao === "antigos" ? "asc" as const : "desc" as const;
  if (req.query.ordenacao !== undefined && !["antigos", "recentes"].includes(String(req.query.ordenacao))) throw new HttpError(422, "Ordenação inválida");
  const base = { ...(status ? { status } : {}), ...(range ? { criado_em: range } : {}) };
  if (kind === "suporte") {
    const where = { ...base, ...(busca ? { OR: [{ assunto: { contains: busca, mode: "insensitive" as const } }, { protocolo: { contains: busca, mode: "insensitive" as const } }] } : {}) };
    const [rows, total] = await Promise.all([prisma.suportes.findMany({ where, skip, take: limit, orderBy: { criado_em: order }, select: { id: true, usuario_id: true, assunto: true, mensagem: true, status: true, protocolo: true, resposta: true, criado_em: true, atualizado_em: true } }), prisma.suportes.count({ where })]);
    res.json(paged(rows, total, page, limit)); return;
  }
  if (kind === "denuncia") {
    const where = { ...base, ...(busca ? { OR: [{ assunto: { contains: busca, mode: "insensitive" as const } }, { protocolo: { contains: busca, mode: "insensitive" as const } }] } : {}) };
    const [rows, total] = await Promise.all([prisma.denuncias.findMany({ where, skip, take: limit, orderBy: { criado_em: order }, select: { id: true, usuario_id: true, denunciado_id: true, objeto_id: true, aluguel_id: true, motivo: true, assunto: true, mensagem: true, status: true, protocolo: true, notas: true, criado_em: true, atualizado_em: true } }), prisma.denuncias.count({ where })]);
    res.json(paged(rows, total, page, limit)); return;
  }
  const where = { ...base, ...(busca ? { descricao: { contains: busca, mode: "insensitive" as const } } : {}) };
  const [rows, total] = await Promise.all([prisma.sinistros.findMany({ where, skip, take: limit, orderBy: { criado_em: order }, select: { id: true, aluguel_id: true, reportador_id: true, status: true, descricao: true, valor_solicitado: true, valor_aprovado: true, notas_analise: true, criado_em: true, atualizado_em: true } }), prisma.sinistros.count({ where })]);
  res.json(paged(rows.map(row=>({...row,valor_solicitado:row.valor_solicitado==null?null:Number(row.valor_solicitado),valor_aprovado:row.valor_aprovado==null?null:Number(row.valor_aprovado)})), total, page, limit));
}; }
// Aplica decisão administrativa ao caso e registra auditoria.
export function reviewCase(kind: "suporte" | "denuncia" | "sinistro"): RequestHandler { return async (req, res) => {
  const id = uuid(req.params.id), status = text(req.body?.status, "Status", 30);
  const statuses = kind === "suporte" ? ["aberto", "em_analise", "respondido", "fechado"] : kind === "denuncia" ? ["aberta", "em_analise", "procedente", "improcedente", "fechada"] : ["aberto", "em_analise", "aprovado", "rejeitado", "fechado"];
  if (!statuses.includes(status)) throw new HttpError(422, "Status inválido");
  const notes = text(req.body?.resposta ?? req.body?.notas ?? req.body?.notas_analise, "Resposta/Notas", 10000);
  const result = await prisma.$transaction(async tx => {
    if (kind === "suporte") {
      const current = await tx.suportes.findUnique({ where: { id } }); if (!current) throw new HttpError(404, "Caso não encontrado");
      if (req.body?.status_atual && req.body.status_atual !== current.status) throw new HttpError(409, "Decisão concorrente", "decisao_concorrente");
      if (current.status === status && current.resposta === notes) return current;
      // Compara estado e data conhecidos para evitar sobrescrever decisão concorrente.
      const updated = await tx.suportes.updateMany({ where: { id, status: current.status, atualizado_em: current.atualizado_em }, data: { status, resposta: notes } });
      if (!updated.count) throw new HttpError(409, "Decisão concorrente", "decisao_concorrente");
      await tx.notificacoes.create({ data: { usuario_id: current.usuario_id, tipo: kind, titulo: "Atendimento atualizado", mensagem: notes.slice(0, 500), contexto: { recursoId: id } } });
      await audit(tx, req.user!.id, "atualizar", kind, id, { status });
      return tx.suportes.findUniqueOrThrow({ where: { id } });
    }
    if (kind === "denuncia") {
      const current = await tx.denuncias.findUnique({ where: { id } }); if (!current) throw new HttpError(404, "Caso não encontrado");
      const publicResponse=req.body?.resposta_usuario===undefined?current.resposta_usuario:text(req.body.resposta_usuario,"Resposta ao usuário",10000);
      if (req.body?.status_atual && req.body.status_atual !== current.status) throw new HttpError(409, "Decisão concorrente", "decisao_concorrente");
      if (current.status === status && current.notas === notes && current.resposta_usuario===publicResponse) return current;
      // Atualização condicional, aviso ao usuário e auditoria pertencem à mesma transação.
      const updated = await tx.denuncias.updateMany({ where: { id, status: current.status, atualizado_em: current.atualizado_em }, data: { status, notas: notes, resposta_usuario:publicResponse } });
      if (!updated.count) throw new HttpError(409, "Decisão concorrente", "decisao_concorrente");
      await tx.notificacoes.create({ data: { usuario_id: current.usuario_id, tipo: kind, titulo: "Atendimento atualizado", mensagem: publicResponse?.slice(0,500)??`Denúncia ${status}.`, contexto: { recursoId: id } } });
      await audit(tx, req.user!.id, "atualizar", kind, id, { status });
      return tx.denuncias.findUniqueOrThrow({ where: { id } });
    }
    const current = await tx.sinistros.findUnique({ where: { id } }); if (!current) throw new HttpError(404, "Caso não encontrado");
    const publicResponse=req.body?.resposta_usuario===undefined?current.resposta_usuario:text(req.body.resposta_usuario,"Resposta ao usuário",10000);
    if (req.body?.status_atual && req.body.status_atual !== current.status) throw new HttpError(409, "Decisão concorrente", "decisao_concorrente");
    if (current.status === status && current.notas_analise === notes && current.resposta_usuario===publicResponse) return current;
    const updated = await tx.sinistros.updateMany({ where: { id, status: current.status, atualizado_em: current.atualizado_em }, data: { status, notas_analise: notes,resposta_usuario:publicResponse, atualizado_em: new Date() } });
    if (!updated.count) throw new HttpError(409, "Decisão concorrente", "decisao_concorrente");
    await tx.notificacoes.create({ data: { usuario_id: current.reportador_id, tipo: kind, titulo: "Atendimento atualizado", mensagem: publicResponse?.slice(0,500)??`Sinistro ${status}.`, contexto: { recursoId: id } } });
    await audit(tx, req.user!.id, "atualizar", kind, id, { status });
    return tx.sinistros.findUniqueOrThrow({ where: { id } });
  }); res.json("valor_solicitado" in result ? { ...result, valor_solicitado: result.valor_solicitado == null ? null : Number(result.valor_solicitado), valor_aprovado: result.valor_aprovado == null ? null : Number(result.valor_aprovado) } : result);
}; }
// Cria ou atualiza categoria usada pelos anúncios.
export const saveCategory: RequestHandler = async (req, res) => {
  const nome = text(req.body?.nome, "Nome", 80).replace(/\s+/g, " "), normalized = slug(nome);
  if (!normalized) throw new HttpError(422, "Categoria inválida");
  const id = req.params.id ? uuid(req.params.id) : null;
  const row = await prisma.$transaction(async tx => {
    if (await tx.categorias.findFirst({ where: { slug: normalized, ...(id ? { id: { not: id } } : {}) } })) throw new HttpError(409, "Slug já utilizado", "slug_duplicado");
    const result = id ? await tx.categorias.update({ where: { id }, data: { nome, slug: normalized } }) : await tx.categorias.create({ data: { nome, slug: normalized } });
    await audit(tx, req.user!.id, id ? "editar" : "criar", "categoria", result.id);
    return result;
  }); res.status(id ? 200 : 201).json(row);
};
// Exclui categoria quando as relações no banco permitem.
export const deleteCategory: RequestHandler = async (req, res) => {
  const id = uuid(req.params.id);
  await prisma.$transaction(async tx => {
    if (await tx.itens.count({ where: { categoria_id: id } })) throw new HttpError(409, "Categoria em uso", "categoria_em_uso");
    await tx.categorias.delete({ where: { id } }); await audit(tx, req.user!.id, "remover", "categoria", id);
  }); res.json({ success: true });
};
// Resume divergência financeira para análise no painel.
function reconciliationDto(c: { id: string; pagamento_id: string; chave: string; motivo: string; status: string; criado_em: Date; pagamento?: any }) {
  const row=c as typeof c & {ignorada_em?:Date|null;motivo_ignorar?:string|null;admin_responsavel_id?:string|null};
  return { id: c.id, pagamento_id: c.pagamento_id, evento: c.chave, motivo: c.motivo, status: c.status, criado_em: c.criado_em, conciliacao_criada_em:c.criado_em, ignorada_em:row.ignorada_em??null, motivo_ignorar:row.motivo_ignorar??null,admin_responsavel:row.admin_responsavel_id??null, ...(c.pagamento ? { tipo:c.pagamento.tipo,gateway:c.pagamento.gateway,referencia_externa:c.pagamento.referencia,valor:Number(c.pagamento.valor),moeda:"BRL",pagamento: paymentDto(c.pagamento) } : {}) };
}
// Lista conciliações abertas ou resolvidas com filtros.
export const adminReconciliations: RequestHandler = async (req, res) => {
  const { page, limit, skip } = pagination(req);
  const status=statusFilter(req,["aberta","ignorada","resolvida"]);
  const where = { ...(status ? { status } : {}) };
  const [rows, total] = await Promise.all([prisma.conciliacoes_pagamento.findMany({ where, skip, take: limit, orderBy: { criado_em: "desc" }, include: { pagamento: { select: { id: true, aluguel_id: true, valor: true, metodo: true, status: true, pago_em: true, referencia: true, tipo: true, gateway: true, criado_em: true } } } }), prisma.conciliacoes_pagamento.count({ where })]);
  res.json(paged(rows.map(reconciliationDto), total, page, limit));
};
// Mostra dados de uma conciliação específica.
export const adminReconciliation: RequestHandler = async (req, res) => {
  const row = await prisma.conciliacoes_pagamento.findUnique({ where: { id: uuid(req.params.id) }, include: { pagamento: { select: { id: true, aluguel_id: true, valor: true, metodo: true, status: true, pago_em: true, referencia: true, tipo: true, gateway: true, criado_em: true } } } });
  if (!row) throw new HttpError(404, "Conciliação não encontrada");
  const data=row.dados && typeof row.dados==="object" && !Array.isArray(row.dados)?row.dados as Record<string,unknown>:{};
  const eventId=typeof data.eventId==="string"?data.eventId:row.chave.startsWith("mp-divergente:")?row.chave.slice("mp-divergente:".length):null;
  const [event,auditRow]=await Promise.all([eventId?prisma.webhook_eventos.findUnique({where:{id:eventId},select:{id:true,criado_em:true,processado_em:true}}):Promise.resolve(null),prisma.admin_auditoria.findFirst({where:{entidade:"conciliacao",entidade_id:row.id,acao:"ignorar"},orderBy:{criado_em:"desc"},select:{admin_id:true,criado_em:true}})]);
  res.json({...reconciliationDto(row),evento_id:event?.id??eventId,evento_criado_em:event?.criado_em??null,evento_processado_em:event?.processado_em??null,resolvida_em:null,decisao_criada_em:auditRow?.criado_em??null,admin_responsavel:row.admin_responsavel_id??auditRow?.admin_id??null});
};
// Registra decisão de ignorar divergência financeira com auditoria.
export const ignoreReconciliation: RequestHandler = async (req, res) => {
  const id = uuid(req.params.id), motivo = text(req.body?.motivo, "Motivo", 1000);
  const row = await prisma.$transaction(async tx => {
    const current = await tx.conciliacoes_pagamento.findUnique({ where: { id } }); if (!current) throw new HttpError(404, "Conciliação não encontrada");
    if (current.status === "ignorada") return current;
    if (current.status !== "aberta") throw new HttpError(409, "Conciliação já decidida");
    const changed = await tx.conciliacoes_pagamento.updateMany({ where: { id, status: "aberta" }, data: { status: "ignorada", ignorada_em:new Date(),motivo_ignorar:motivo,admin_responsavel_id:req.user!.id } });
    if (!changed.count) throw new HttpError(409, "Decisão concorrente", "decisao_concorrente");
    await audit(tx, req.user!.id, "ignorar", "conciliacao", id, { motivo });
    return tx.conciliacoes_pagamento.findUniqueOrThrow({ where: { id } });
  }); res.json(reconciliationDto(row));
};
// Exibe eventos do provedor ainda não processados pelo job.
export const adminPendingWebhooks: RequestHandler = async (req, res) => {
  const { page, limit, skip } = pagination(req);
  const where = { processado_em: null };
  const [rows, total] = await Promise.all([prisma.webhook_eventos.findMany({ where, skip, take: limit, orderBy: { criado_em: "asc" }, select: { id: true, criado_em: true, processado_em: true } }), prisma.webhook_eventos.count({ where })]);
  res.json(paged(rows, total, page, limit));
};
