import { cpf, text, uuid } from "../utils/validation.ts";
import type { RequestHandler } from "express";
import prisma from "../config/database.ts";
import { HttpError } from "../utils/httpError.ts";
import { removeAccount } from "../services/accountRemoval.ts";
import { activeStatuses } from "../services/rentalRules.ts";
import { asBoolean } from "../utils/strings.ts";
import { audit, dateFilters, paged, pagination, statusFilter } from "../utils/admin.ts";
import { publishNotification } from "../../realtime/realtimeService.ts";
import { serializeAdminItem, serializeNotification, serializeRental } from "../utils/serializers.ts";
import { rentalInclude } from "./rentalsController.ts";
import { userReportWhere } from "../services/reportRules.ts";
import { avatarUrl } from "../utils/files.ts";
import { expireSubscriptions, publicationContext, subscriptionDto } from "../services/subscriptionService.ts";

// Valida alterações administrativas de campos booleanos.
function requiredBoolean(value: unknown): boolean {
  if (!(typeof value === "boolean" || ["true", "false", "1", "0", "on", "off"].includes(String(value).toLowerCase()))) throw new HttpError(422, "O campo ativo deve ser verdadeiro ou falso");
  return asBoolean(value);
}
// Agrega contagens e valores usados no painel administrativo.
export const metrics: RequestHandler = async (req, res) => {
  const range = dateFilters(req);
  // Executa agregações independentes em paralelo. O período usa a coluna
  // apropriada de cada métrica. Receita inclui exclusivamente planos confirmados.
  const [usuarios, usuariosAtivos, objetos, objetosVisiveis, alugueis, contratados, pagamentos, assinaturasAtivas, verificacoes, suporte, denuncias] = await Promise.all([
    prisma.usuarios.count({ where: { ...(range ? { criado_em: range } : {}) } }),
    prisma.usuarios.count({ where: { ativo: true, ...(range ? { criado_em: range } : {}) } }),
    prisma.itens.count({ where: { ...(range ? { criado_em: range } : {}) } }),
    prisma.itens.count({ where: { arquivado: false, ...(range ? { criado_em: range } : {}) } }),
    prisma.alugueis.count({ where: { ...(range ? { criado_em: range } : {}) } }),
    prisma.eventos_aluguel.count({where:{status:"aprovado",...(range?{criado_em:range}:{})}}),
    prisma.pagamentos_assinatura.aggregate({ where: { status: "pago", ...(range ? { confirmado_em: range } : {}) }, _count: true, _sum: { valor_centavos: true } }),
    prisma.assinaturas.count({ where: { status: "ativa", inicio: { lte: new Date() }, fim: { gt: new Date() }, planos: { codigo: { in: ["intermediario", "avancado"] } } } }),
    prisma.verificacoes_identidade.count({ where: { ...(range ? { criado_em: range } : {}) } }),
    prisma.suportes.count({ where: { ...(range ? { criado_em: range } : {}) } }),
    prisma.denuncias.count({ where: { ...(range ? { criado_em: range } : {}) } }),
  ]);
  const plans = { quantidade: pagamentos._count, valor: Number(pagamentos._sum.valor_centavos ?? 0) / 100 };
  res.json({ periodo: { dataInicio: req.query.dataInicio ?? null, dataFim: req.query.dataFim ?? null, timezone: "UTC", base: "criado_em para cadastros; confirmado_em para receita de planos" }, usuarios: { total: usuarios, ativos: usuariosAtivos }, objetos: { total: objetos, naoArquivados: objetosVisiveis }, alugueis: { total: alugueis, contratados }, pagamentos: { planos: plans, aprovados: plans, assinaturasAtivas }, verificacoes: { total: verificacoes }, suporte: { total: suporte }, denuncias: { total: denuncias } });
};
// Filtra e pagina usuários para o painel, sem expor o hash de senha.
export const listUsers: RequestHandler = async (req, res) => {
  await expireSubscriptions();
  const { page, limit, skip } = pagination(req, 25);
  const status = statusFilter(req, ["ativo", "inativo"]);
  const plano = req.query.plano;
  if (plano !== undefined && !["gratuito", "assinantes"].includes(String(plano))) throw new HttpError(422, "Filtro de plano inválido", "plano_invalido");
  const now = new Date();
  const paid = { some: { status: "ativa", inicio: { lte: now }, fim: { gt: now }, planos: { codigo: { in: ["intermediario", "avancado"] } } } };
  const busca = typeof req.query.busca === "string" && req.query.busca.trim() ? text(req.query.busca, "Busca", 100) : undefined;
  const buscaCpf = busca?.replace(/\D/g, "");
  const where = {
    ...(plano ? { assinaturas: plano === "assinantes" ? paid : { none: paid.some } } : {}),
    ...(status ? { ativo: status === "ativo" } : {}),
    ...(busca ? { OR: [
      { nome: { contains: busca, mode: "insensitive" as const } },
      { email: { contains: busca, mode: "insensitive" as const } },
      ...(buscaCpf ? [{ cpf: { contains: buscaCpf } }] : []),
    ] } : {}),
  };
  const [rows, total] = await Promise.all([prisma.usuarios.findMany({ where, skip, take: limit, orderBy: { criado_em: "desc" }, select: { id: true, nome: true, email: true, tipo: true, ativo: true, verificado: true, criado_em: true, foto_url: true } }), prisma.usuarios.count({ where })]);
  const dados = await Promise.all(rows.map(async row => {
    const context = await publicationContext(row.id, now);
    return { ...row, avatarUrl: avatarUrl(row.foto_url), plano: { codigo: context.plano.codigo, nome: context.plano.nome }, anuncios_usados: context.utilizadas };
  }));
  res.json({ dados, total, pagina: page, paginas: Math.ceil(total / limit) });
};
export const getAdminUserSubscription: RequestHandler = async (req, res) => {
  const id = uuid(req.params.id);
  if (!await prisma.usuarios.findUnique({ where: { id }, select: { id: true } })) throw new HttpError(404, "Usuário não encontrado", "nao_encontrada");
  await expireSubscriptions();
  res.json(subscriptionDto(await publicationContext(id)));
};
// Detalha a conta sem credenciais ou listas potencialmente ilimitadas.
export const getUser: RequestHandler = async (req, res) => {
  const id = uuid(req.params.id);
  const user = await prisma.usuarios.findUnique({
    where: { id },
    select: {
      id: true, nome: true, email: true, tipo: true, ativo: true,
      verificado: true, foto_url: true, criado_em: true, motivo_suspensao: true,
      _count: { select: {
        itens: true,
        alugueis_alugueis_locatario_idTousuarios: true,
        alugueis_alugueis_locador_idTousuarios: true,
      } },
    },
  });
  if (!user) throw new HttpError(404, "Usuário não encontrado", "nao_encontrada");
  const [approvedIdentity, latestIdentity, activeRentals, pendingRequests, receivedReports, publication] = await Promise.all([
    prisma.verificacoes_identidade.count({ where: { usuario_id: id, status: "aprovado", revogada: false } }),
    prisma.verificacoes_identidade.findFirst({ where: { usuario_id: id }, orderBy: { criado_em: "desc" }, select: { id: true, status: true, revogada: true } }),
    prisma.alugueis.count({ where: { OR: [{ locador_id: id }, { locatario_id: id }], status: { in: ["aprovado", "pago", "retirado", "devolvido"] } } }),
    prisma.alugueis.count({ where: { OR: [{ locador_id: id }, { locatario_id: id }], status: "pendente" } }),
    prisma.denuncias.count({ where: userReportWhere({ denunciado_id: id }) }),
    publicationContext(id),
  ]);
  const { _count, ...dados } = user;
  res.json({
    ...dados,
    plano: { codigo: publication.plano.codigo, nome: publication.plano.nome },
    anuncios_usados: publication.utilizadas,
    avatarUrl: avatarUrl(dados.foto_url),
    verificado: approvedIdentity > 0,
    verificacao: latestIdentity,
    em_locacao: activeRentals > 0,
    tem_solicitacao_pendente: pendingRequests > 0,
    estatisticas: {
      objetos: _count.itens,
      alugueis_como_locatario: _count.alugueis_alugueis_locatario_idTousuarios,
      alugueis_como_proprietario: _count.alugueis_alugueis_locador_idTousuarios,
      denuncias_recebidas: receivedReports,
    },
  });
};
// Consulta pendências que condicionam alterações administrativas da conta.
async function obligations(tx: any, id: string) {
  const [rentals, finance] = await Promise.all([
    tx.alugueis.count({ where: { OR: [{ locador_id: id }, { locatario_id: id }], status: { in: activeStatuses } } }),
    tx.assinaturas.count({ where: { usuario_id: id, status: { in: ["pendente", "ativa"] }, planos: { codigo: { in: ["intermediario", "avancado"] } } } }),
  ]);
  if (rentals || finance) throw new HttpError(409, "Usuário possui obrigações ativas", "usuario_com_obrigacoes_ativas");
}
// Altera atividade da conta após verificar obrigações e registra auditoria.
export const updateUserStatus: RequestHandler = async (req, res) => {
  const id = uuid(req.params.id), active = requiredBoolean(req.body?.ativo);
  if (id === req.user!.id && !active) throw new HttpError(409, "Você não pode suspender sua própria conta");
  const motivo = !active ? text(req.body?.motivo, "Motivo", 500) : null;
  if (!active && (!motivo || motivo.length < 5)) throw new HttpError(422, "O motivo deve ter entre 5 e 500 caracteres", "motivo_invalido");
  const user = await prisma.$transaction(async tx => {
    await tx.$queryRaw`SELECT id FROM usuarios WHERE id=${id}::uuid FOR UPDATE`;
    const current = await tx.usuarios.findUnique({ where: { id } });
    if (!current) throw new HttpError(404, "Usuário não encontrado");
    if (current.tipo === "admin") throw new HttpError(403, "Não há hierarquia autorizada para alterar outra conta administrativa", "hierarquia_admin_ausente");
    if (current.ativo === active) return { updated: { id: current.id, nome: current.nome, email: current.email, ativo: current.ativo, tipo: current.tipo, motivo_suspensao: current.motivo_suspensao }, notification: null };
    // Desativação exige ausência de obrigações; reativação exige CPF válido.
    // A sessão é preservada para permitir o canal restrito de suporte da conta suspensa.
    if (!active) await obligations(tx, id);
    else { try { cpf(current.cpf); } catch { throw new HttpError(409, "CPF ausente ou inválido; corrija antes de reativar", "cpf_invalido_reativacao"); } }
    const updated = await tx.usuarios.update({ where: { id }, data: { ativo: active, motivo_suspensao: active ? null : motivo, atualizado_em: new Date() }, select: { id: true, nome: true, email: true, ativo: true, tipo: true, motivo_suspensao: true } });
    const notification=await tx.notificacoes.create({ data: { usuario_id: id, chave: `status-conta:${id}:${active ? "ativa" : "suspensa"}:${Date.now()}`, tipo: active ? "conta_reativada" : "bloqueio_conta", titulo: active ? "Conta reativada" : "Conta suspensa", mensagem: active ? "Sua conta foi reativada." : `Sua conta foi suspensa. Motivo: ${motivo}`, contexto: { critico: true } } });
    await audit(tx, req.user!.id, active ? "usuario_reativado" : "usuario_suspenso", "usuario", id, { motivo });
    return {updated,notification};
  });
  if(user.notification)publishNotification(id,serializeNotification(user.notification));
  res.json({ success: true, usuario: user.updated });
};
// Solicita remoção administrativa da conta com as verificações do serviço.
export const deleteUser: RequestHandler = async (req, res) => {
  const id = uuid(req.params.id);
  if (id === req.user!.id) throw new HttpError(409, "Você não pode excluir sua própria conta");
  const target = await prisma.usuarios.findUnique({ where: { id }, select: { tipo: true } });
  if (!target) throw new HttpError(404, "Usuário não encontrado");
  if (target.tipo === "admin") throw new HttpError(403, "Não há hierarquia autorizada para excluir outra conta administrativa", "hierarquia_admin_ausente");
  await removeAccount(id, false, req.user!.id);
  res.json({ success: true });
};
// Lista anúncios com filtros e paginação para moderação.
export const listAdminItems: RequestHandler = async (req, res) => {
  const { page, limit, skip } = pagination(req);
  const status=statusFilter(req,["ativo","arquivado"]);
  const busca = typeof req.query.busca === "string" && req.query.busca.trim() ? text(req.query.busca, "Busca", 100) : undefined;
  const ownerId = req.query.proprietario_id === undefined ? undefined : uuid(req.query.proprietario_id, "Proprietário");
  const where = {
    ...(ownerId ? { usuario_id: ownerId } : {}),
    ...(status === "arquivado" ? { arquivado: true } : status === "ativo" ? { arquivado: false } : {}),
    ...(busca ? { OR: [
      { titulo: { contains: busca, mode: "insensitive" as const } },
      { usuarios: { nome: { contains: busca, mode: "insensitive" as const } } },
      { categorias: { nome: { contains: busca, mode: "insensitive" as const } } },
    ] } : {}),
  };
  const [data, total] = await Promise.all([prisma.itens.findMany({ where, skip, take: limit, orderBy: { criado_em: "desc" }, select: { id: true, usuario_id: true, titulo: true, preco_por_dia: true, disponivel: true, arquivado: true, oculto_pelo_admin: true, motivo_ocultacao: true, criado_em: true, categorias: { select: { nome: true, slug: true } }, usuarios: { select: { id: true, nome: true } }, fotos_item: { where: { principal: true }, take: 1, select: { url: true } } } }), prisma.itens.count({ where })]);
  const rentalStates = data.length ? await prisma.alugueis.groupBy({
    by: ["item_id", "status"],
    where: { item_id: { in: data.map(row => row.id) }, status: { in: ["pendente", "aprovado", "pago", "retirado", "devolvido"] } },
    _count: true,
  }) : [];
  const statesByItem = new Map<string, Set<string>>();
  for (const row of rentalStates) {
    if (!row.status) continue;
    const states = statesByItem.get(row.item_id) ?? new Set<string>();
    states.add(row.status);
    statesByItem.set(row.item_id, states);
  }
  res.json(paged(data.map(row => {
    const states = statesByItem.get(row.id) ?? new Set<string>();
    return serializeAdminItem(row, states);
  }), total, page, limit));
};
// Lista locações com filtros e paginação para acompanhamento.
export const listAdminRentals: RequestHandler = async (req, res) => {
  if (req.params.id) {
    const userId = uuid(req.params.id, "Usuário");
    if (!await prisma.usuarios.findUnique({ where: { id: userId }, select: { id: true } })) {
      throw new HttpError(404, "Usuário não encontrado", "nao_encontrada");
    }
    const { limit, skip } = pagination(req, 25);
    const where = { OR: [{ locador_id: userId }, { locatario_id: userId }] };
    const [data, total] = await Promise.all([
      prisma.alugueis.findMany({ where, skip, take: limit, orderBy: [{ criado_em: { sort: "desc", nulls: "last" } }, { id: "desc" }], include: rentalInclude }),
      prisma.alugueis.count({ where }),
    ]);
    res.json({ data: data.map(serializeRental), total });
    return;
  }
  const { page, limit, skip } = pagination(req);
  const status=statusFilter(req,["pendente","aprovado","recusado","pago","retirado","devolvido","finalizado","cancelado"]);
  const where = { ...(status ? { status } : {}) };
  const [data, total] = await Promise.all([prisma.alugueis.findMany({ where, skip, take: limit, orderBy: { criado_em: "desc" }, select: { id: true, item_id: true, locador_id: true, locatario_id: true, status: true, data_inicio: true, data_fim: true, valor_total: true, criado_em: true, itens: { select: { titulo: true } }, usuarios_alugueis_locador_idTousuarios: { select: { nome: true } }, usuarios_alugueis_locatario_idTousuarios: { select: { nome: true } } } }), prisma.alugueis.count({ where })]);
  res.json(paged(data.map(row=>({...row,valor_total:Number(row.valor_total)})), total, page, limit));
};
// Corrige CPF com validação e trilha de auditoria administrativa.
export const correctUserCpf: RequestHandler = async (req, res) => {
  const id = uuid(req.params.id), documento = cpf(req.body?.cpf);
  const user = await prisma.$transaction(async tx => {
    const row = await tx.usuarios.update({ where: { id }, data: { cpf: documento, token_version: { increment: 1 } }, select: { id: true, nome: true, ativo: true } });
    await audit(tx, req.user!.id, "corrigir_cpf", "usuario", id);
    return row;
  });
  res.json({ success: true, usuario: user });
};
