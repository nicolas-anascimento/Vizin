import type { RequestHandler } from "express";
import prisma from "../config/database.ts";
import { text, uuid, slug } from "../utils/validation.ts";
import { HttpError } from "../utils/httpError.ts";
import { serializeReview } from "../utils/serializers.ts";
import { audit, dateFilters, paged, pagination, statusFilter } from "../utils/admin.ts";
import { userReportWhere } from "../services/reportRules.ts";
import { avatarUrl } from "../utils/files.ts";

// DTO financeiro do painel, sem dados sensíveis do meio de pagamento.
function paymentDto(p: any) {
  return {
    id: p.id, assinatura_id: p.assinatura_id, valor_centavos: p.valor_centavos,
    valor: p.valor_centavos / 100, metodo: p.metodo, status: p.status,
    pago_em: p.confirmado_em, referencia: p.referencia_pagamento,
    tipo: "assinatura", gateway: p.provedor, criado_em: p.criado_em,
    usuario: p.usuario, plano: p.plano, assinatura: p.assinatura,
    assinatura_status: p.assinatura?.status ?? null,
    periodo_inicio: p.status === "pago" ? p.assinatura?.inicio ?? null : null,
    periodo_fim: p.status === "pago" ? p.assinatura?.fim ?? null : null,
    cartao: null, motivo_falha: null,
  };
}
const paymentSelect = {
  id: true, assinatura_id: true, valor_centavos: true, metodo: true, status: true,
  confirmado_em: true, referencia_pagamento: true, provedor: true, criado_em: true,
  usuario: { select: { id: true, nome: true, email: true } },
  plano: { select: { codigo: true, nome: true } },
  assinatura: { select: { status: true, inicio: true, fim: true, cancelar_ao_final: true, renovacao_habilitada: true } },
} as const;
// Filtra e pagina cobranças para acompanhamento administrativo.
export const adminPayments: RequestHandler = async (req, res) => {
  const { page, limit, skip } = pagination(req);
  if (req.query.tipo !== undefined && req.query.tipo !== "assinatura") throw new HttpError(422, "Tipo de pagamento inválido", "tipo_invalido");
  const status=statusFilter(req,["pendente","pago","falhou","cancelado","estornado"]);
  const plano = req.query.plano === undefined ? undefined : text(req.query.plano, "Plano", 30);
  const assinaturaStatus = req.query.assinatura_status === undefined ? undefined : text(req.query.assinatura_status, "Status da assinatura", 30);
  const usuario = req.query.usuario === undefined ? undefined : text(req.query.usuario, "Usuário", 100);
  if (assinaturaStatus && !["pendente","ativa","expirada","falha","cancelada"].includes(assinaturaStatus)) throw new HttpError(422,"Status da assinatura inválido","status_invalido");
  const parseDay = (value: unknown, end: boolean) => {
    if (value === undefined) return undefined;
    if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new HttpError(422,"Período inválido","periodo_invalido");
    const date = new Date(`${value}T00:00:00.000Z`);
    if (Number.isNaN(date.getTime()) || date.toISOString().slice(0,10) !== value) throw new HttpError(422,"Período inválido","periodo_invalido");
    if (end) date.setUTCDate(date.getUTCDate()+1);
    return date;
  };
  const start = parseDay(req.query.periodo_inicio,false), end = parseDay(req.query.periodo_fim,true);
  if (start && end && start >= end) throw new HttpError(422,"Período inválido","periodo_invalido");
  const busca = typeof req.query.busca === "string" && req.query.busca.trim() ? text(req.query.busca, "Busca", 100) : undefined;
  const buscaUuid = busca && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(busca) ? busca : undefined;
  const where = {
    ...(status ? { status } : {}),
    ...(plano ? { plano: { codigo: plano } } : {}),
    ...(assinaturaStatus ? { assinatura: { status: assinaturaStatus } } : {}),
    ...(usuario ? { usuario: { OR: [{ nome: { contains: usuario, mode: "insensitive" as const } }, { email: { contains: usuario, mode: "insensitive" as const } }] } } : {}),
    ...(start || end ? { criado_em: { ...(start ? { gte: start } : {}), ...(end ? { lt: end } : {}) } } : {}),
    ...(busca ? { OR: [
      ...(buscaUuid ? [{ id: buscaUuid }] : []),
      { referencia_pagamento: { contains: busca, mode: "insensitive" as const } },
      { metodo: { contains: busca, mode: "insensitive" as const } },
      { usuario: { nome: { contains: busca, mode: "insensitive" as const } } },
      { plano: { nome: { contains: busca, mode: "insensitive" as const } } },
    ] } : {}),
  };
  const [rows, total] = await Promise.all([prisma.pagamentos_assinatura.findMany({ where, skip, take: limit, orderBy: { criado_em: "desc" }, select: paymentSelect }), prisma.pagamentos_assinatura.count({ where })]);
  res.json(paged(rows.map(paymentDto), total, page, limit));
};
// Detalha uma cobrança para análise administrativa.
export const adminPayment: RequestHandler = async (req, res) => {
  const payment = await prisma.pagamentos_assinatura.findUnique({ where: { id: uuid(req.params.id) }, select: paymentSelect });
  if (!payment) throw new HttpError(404, "Pagamento não encontrado", "nao_encontrada");
  res.json(paymentDto(payment));
};
// Agrega exatamente os indicadores exibidos pela tela financeira administrativa.
export const adminPaymentStats: RequestHandler = async (_req, res) => {
  const today = new Date();
  const currentMonth = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), 1));
  const nextMonth = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() + 1, 1));
  const previousMonth = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() - 1, 1));
  const monthRanges = Array.from({ length: 6 }, (_, index) => {
    const offset = index - 5;
    const labelDate = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() + offset, 1));
    return {
      mes: `${labelDate.getUTCFullYear()}-${String(labelDate.getUTCMonth() + 1).padStart(2, "0")}`,
      start: labelDate,
      end: new Date(Date.UTC(labelDate.getUTCFullYear(), labelDate.getUTCMonth() + 1, 1)),
    };
  });
  const [total, pending, failed, current, previous, methods, active, cancelled, expired, ...months] = await Promise.all([
    prisma.pagamentos_assinatura.aggregate({ where: { status: "pago" }, _sum: { valor_centavos: true } }),
    prisma.pagamentos_assinatura.count({ where: { status: "pendente" } }),
    prisma.pagamentos_assinatura.count({ where: { status: "falhou" } }),
    prisma.pagamentos_assinatura.aggregate({ where: { status: "pago", confirmado_em: { gte: currentMonth, lt: nextMonth } }, _sum: { valor_centavos: true } }),
    prisma.pagamentos_assinatura.aggregate({ where: { status: "pago", confirmado_em: { gte: previousMonth, lt: currentMonth } }, _sum: { valor_centavos: true } }),
    prisma.pagamentos_assinatura.groupBy({ by: ["metodo"], where: { status: "pago" }, _sum: { valor_centavos: true } }),
    prisma.assinaturas.count({ where: { status: "ativa", inicio: { lte: today }, fim: { gt: today }, planos: { codigo: { in: ["intermediario", "avancado"] } } } }),
    prisma.assinaturas.count({ where: { planos: { codigo: { in: ["intermediario", "avancado"] } }, OR: [{ status: "cancelada" }, { status: "ativa", cancelar_ao_final: true }] } }),
    prisma.assinaturas.count({ where: { status: "expirada", planos: { codigo: { in: ["intermediario", "avancado"] } } } }),
    ...monthRanges.map(range => prisma.pagamentos_assinatura.aggregate({ where: { status: "pago", confirmado_em: { gte: range.start, lt: range.end } }, _sum: { valor_centavos: true } })),
  ]);
  const currentValue = Number(current._sum.valor_centavos ?? 0) / 100;
  const previousValue = Number(previous._sum.valor_centavos ?? 0) / 100;
  res.json({
    receita_total: Number(total._sum.valor_centavos ?? 0) / 100,
    receita_bruta_total: Number(total._sum.valor_centavos ?? 0) / 100,
    receita_liquida_total: null,
    receita_liquida_indisponivel: "Taxas líquidas do provedor não são persistidas no contrato atual.",
    receita_variacao_percentual: previousValue > 0 ? ((currentValue - previousValue) / previousValue) * 100 : null,
    pagamentos_pendentes: pending,
    transacoes_falhadas: failed,
    assinaturas_ativas: active, assinaturas_canceladas: cancelled, assinaturas_expiradas: expired,
    receita_mensal: monthRanges.map((range, index) => ({ mes: range.mes, valor: Number(months[index]!._sum.valor_centavos ?? 0) / 100 })),
    metodos: methods.filter(row => row.metodo).map(row => ({ metodo: row.metodo, total: Number(row._sum.valor_centavos ?? 0) / 100 })),
    timezone: "UTC",
    receita_base: "pagamentos_assinatura.confirmado_em",
  });
};
// Lista avaliações para moderação.
export const adminReviews: RequestHandler = async (req, res) => {
  const { page, limit, skip } = pagination(req);
  const range = dateFilters(req); const where = { ...(range ? { criado_em: range } : {}) };
  const [rows, total] = await Promise.all([prisma.avaliacoes.findMany({ where, skip, take: limit, orderBy: { criado_em: "desc" }, include: { usuarios_avaliacoes_avaliador_idTousuarios: { select: { id: true, nome: true, foto_url: true } }, usuarios_avaliacoes_avaliado_idTousuarios: { select: { id: true, nome: true } }, item: { select: { titulo: true } }, alugueis: { select: { itens: { select: { titulo: true } } } } } }), prisma.avaliacoes.count({ where })]);
  res.json(paged(rows.map(row => ({ ...serializeReview(row), oculta: row.oculta, avaliador: { id: row.usuarios_avaliacoes_avaliador_idTousuarios.id, nome: row.usuarios_avaliacoes_avaliador_idTousuarios.nome, avatarUrl: avatarUrl(row.usuarios_avaliacoes_avaliador_idTousuarios.foto_url) }, avaliado: row.usuarios_avaliacoes_avaliado_idTousuarios, produtoTitulo: row.item?.titulo ?? row.alugueis.itens.titulo })), total, page, limit));
};
// Oculta ou reexibe sem apagar o conteúdo histórico.
export const updateReview: RequestHandler = async (req, res) => {
  const id = uuid(req.params.id);
  if (typeof req.body?.oculta !== "boolean") throw new HttpError(422, "oculta deve ser booleano");
  const reason = req.body.oculta ? text(req.body?.motivo, "Motivo", 1000) : null;
  if (req.body.oculta && (!reason || reason.length < 5)) throw new HttpError(422, "O motivo deve ter ao menos 5 caracteres", "motivo_invalido");
  const row = await prisma.$transaction(async tx => {
    await tx.$queryRaw`SELECT id FROM avaliacoes WHERE id=${id}::uuid FOR UPDATE`;
    const current = await tx.avaliacoes.findUnique({ where: { id } });
    if (!current) throw new HttpError(404, "Avaliação não encontrada");
    if (current.oculta === req.body.oculta) return current;
    const updated = await tx.avaliacoes.update({ where: { id }, data: { oculta: req.body.oculta, motivo_ocultacao: reason } });
    const action = req.body.oculta ? "avaliacao_ocultada" : "avaliacao_reexibida";
    await audit(tx, req.user!.id, action, "avaliacao", id, { motivo: reason });
    if (req.body.oculta) await tx.notificacoes.createMany({ data: [
      { usuario_id: current.avaliador_id, chave: `${action}:${id}:autor`, tipo: "avaliacao_ocultada_admin", titulo: "Avaliação ocultada", mensagem: `Sua avaliação foi ocultada. Motivo: ${reason}`, contexto: { avaliacaoId: id } },
      { usuario_id: current.avaliado_id, chave: `${action}:${id}:alvo`, tipo: "avaliacao_sobre_voce_ocultada_admin", titulo: "Avaliação ocultada", mensagem: "Uma avaliação sobre você foi ocultada pela moderação.", contexto: { avaliacaoId: id } },
    ] });
    return updated;
  });
  res.json(row);
};
// Remove avaliação indicada e registra a ação administrativa.
export const removeReview: RequestHandler = async (req, res) => {
  const id = uuid(req.params.id);
  const reason = text(req.body?.motivo, "Motivo", 1000);
  if (reason.length < 5) throw new HttpError(422, "O motivo deve ter ao menos 5 caracteres", "motivo_invalido");
  await prisma.$transaction(async tx => {
    const current = await tx.avaliacoes.findUnique({ where: { id }, include: { usuarios_avaliacoes_avaliador_idTousuarios: { select: { nome: true } }, usuarios_avaliacoes_avaliado_idTousuarios: { select: { nome: true } } } });
    if (!current) throw new HttpError(404, "Avaliação não encontrada");
    await audit(tx, req.user!.id, "avaliacao_excluida", "avaliacao", id, { motivo: reason, avaliador: current.usuarios_avaliacoes_avaliador_idTousuarios.nome, avaliado: current.usuarios_avaliacoes_avaliado_idTousuarios.nome });
    await tx.notificacoes.createMany({ data: [
      { usuario_id: current.avaliador_id, chave: `avaliacao_excluida:${id}:autor`, tipo: "avaliacao_removida_admin", titulo: "Avaliação removida", mensagem: `Sua avaliação foi removida. Motivo: ${reason}`, contexto: { avaliacaoId: id } },
      { usuario_id: current.avaliado_id, chave: `avaliacao_excluida:${id}:alvo`, tipo: "avaliacao_sobre_voce_removida_admin", titulo: "Avaliação removida", mensagem: "Uma avaliação sobre você foi removida pela moderação.", contexto: { avaliacaoId: id } },
    ] });
    await tx.avaliacoes.delete({ where: { id } });
  });
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
    const where = userReportWhere({ ...base, ...(busca ? { OR: [{ assunto: { contains: busca, mode: "insensitive" as const } }, { protocolo: { contains: busca, mode: "insensitive" as const } }] } : {}) });
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
  const icon = text(req.body?.icone, "Ícone", 50), color = text(req.body?.cor, "Cor", 7).toUpperCase();
  if (!/^bi-[a-z0-9-]+$/.test(icon)) throw new HttpError(422, "Ícone inválido", "icone_invalido");
  if (!/^#[0-9A-F]{6}$/.test(color)) throw new HttpError(422, "Cor inválida", "cor_invalida");
  const id = req.params.id ? uuid(req.params.id) : null;
  const row = await prisma.$transaction(async tx => {
    if (await tx.categorias.findFirst({ where: { nome: { equals: nome, mode: "insensitive" }, ...(id ? { id: { not: id } } : {}) } })) throw new HttpError(409, "Já existe categoria com esse nome", "nome_duplicado");
    if (!id && await tx.categorias.findUnique({ where: { slug: normalized } })) throw new HttpError(409, "Slug já utilizado", "slug_duplicado");
    const result = id ? await tx.categorias.update({ where: { id }, data: { nome, icone: icon, cor: color } }) : await tx.categorias.create({ data: { nome, slug: normalized, icone: icon, cor: color } });
    await audit(tx, req.user!.id, "categoria_alterada", "categoria", result.id, { operacao: id ? "editar" : "criar" });
    return result;
  }); res.status(id ? 200 : 201).json(row);
};
export const listAdminCategories: RequestHandler = async (_req,res) => {
  const rows=await prisma.categorias.findMany({orderBy:{nome:"asc"},include:{_count:{select:{itens:true}}}});
  res.json(rows.map(({_count,...row})=>({...row,total_itens:_count.itens})));
};
export const moveCategoryItems: RequestHandler = async (req,res) => {
  const source=uuid(req.params.id),destination=uuid(req.body?.destino_id,"Categoria de destino");
  if(source===destination)throw new HttpError(422,"Origem e destino devem ser diferentes","categoria_destino_igual");
  const moved=await prisma.$transaction(async tx=>{await tx.$queryRaw`SELECT id FROM categorias WHERE id IN (${source}::uuid,${destination}::uuid) ORDER BY id FOR UPDATE`;const count=await tx.categorias.count({where:{id:{in:[source,destination]}}});if(count!==2)throw new HttpError(404,"Categoria não encontrada");const result=await tx.itens.updateMany({where:{categoria_id:source},data:{categoria_id:destination}});await audit(tx,req.user!.id,"categoria_alterada","categoria",source,{operacao:"mover_itens",destino_id:destination,movidos:result.count});return result.count;},{isolationLevel:"Serializable"});
  res.json({movidos:moved});
};
// Exclui categoria quando as relações no banco permitem.
export const deleteCategory: RequestHandler = async (req, res) => {
  const id = uuid(req.params.id);
  await prisma.$transaction(async tx => {
    await tx.$queryRaw`SELECT id FROM categorias WHERE id=${id}::uuid FOR UPDATE`;
    if (!await tx.categorias.findUnique({where:{id},select:{id:true}})) throw new HttpError(404,"Categoria não encontrada");
    if (await tx.itens.count({ where: { categoria_id: id } })) throw new HttpError(409, "Não é possível excluir esta categoria porque existem objetos vinculados.", "categoria_com_itens");
    await tx.categorias.delete({ where: { id } }); await audit(tx, req.user!.id, "categoria_alterada", "categoria", id, { operacao: "remover" });
  },{isolationLevel:"Serializable"}); res.json({ success: true });
};
// Resume divergência financeira para análise no painel.
function reconciliationDto(c: { id: string; pagamento_id: string; chave: string; motivo: string; status: string; criado_em: Date; pagamento?: any }) {
  const row=c as typeof c & {ignorada_em?:Date|null;motivo_ignorar?:string|null;admin_responsavel_id?:string|null};
  return { id: c.id, pagamento_id: c.pagamento_id, evento: c.chave, motivo: c.motivo, status: c.status, criado_em: c.criado_em, conciliacao_criada_em:c.criado_em, ignorada_em:row.ignorada_em??null, motivo_ignorar:row.motivo_ignorar??null,admin_responsavel:row.admin_responsavel_id??null, ...(c.pagamento ? { tipo:c.pagamento.tipo,gateway:c.pagamento.gateway,referencia_externa:c.pagamento.referencia,valor:Number(c.pagamento.valor),moeda:"BRL",pagamento: { id:c.pagamento.id,aluguel_id:c.pagamento.aluguel_id,valor:Number(c.pagamento.valor),metodo:c.pagamento.metodo,status:c.pagamento.status,pago_em:c.pagamento.pago_em,referencia:c.pagamento.referencia,tipo:c.pagamento.tipo,gateway:c.pagamento.gateway,criado_em:c.pagamento.criado_em } } : {}) };
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
