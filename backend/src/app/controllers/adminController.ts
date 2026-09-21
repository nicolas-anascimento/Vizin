import { cpf, uuid } from "../utils/validation.ts";
import type { RequestHandler } from "express";
import prisma from "../config/database.ts";
import { HttpError } from "../utils/httpError.ts";
import { removeAccount } from "../services/accountRemoval.ts";
import { activeStatuses } from "../services/rentalRules.ts";
import { asBoolean } from "../utils/strings.ts";
import { audit, dateFilters, paged, pagination, statusFilter } from "../utils/admin.ts";

// Valida alterações administrativas de campos booleanos.
function requiredBoolean(value: unknown): boolean {
  if (!(typeof value === "boolean" || ["true", "false", "1", "0", "on", "off"].includes(String(value).toLowerCase()))) throw new HttpError(422, "O campo ativo deve ser verdadeiro ou falso");
  return asBoolean(value);
}
// Agrega contagens e valores usados no painel administrativo.
export const metrics: RequestHandler = async (req, res) => {
  const range = dateFilters(req);
  // Executa agregações independentes em paralelo. O período usa a coluna
  // apropriada de cada métrica e a resposta informa o fuso America/Sao_Paulo.
  const [usuarios, usuariosAtivos, objetos, objetosVisiveis, alugueis, contratados, pagamentos, verificacoes, suporte, denuncias, multas, estornosPendentes, estornosConcluidos, cancelamentosPendentes, cancelamentosConcluidos, taxaContratada, taxaRecebida] = await Promise.all([
    prisma.usuarios.count({ where: { ...(range ? { criado_em: range } : {}) } }),
    prisma.usuarios.count({ where: { ativo: true, ...(range ? { criado_em: range } : {}) } }),
    prisma.itens.count({ where: { ...(range ? { criado_em: range } : {}) } }),
    prisma.itens.count({ where: { arquivado: false, ...(range ? { criado_em: range } : {}) } }),
    prisma.alugueis.count({ where: { ...(range ? { criado_em: range } : {}) } }),
    prisma.eventos_aluguel.count({where:{status:"aprovado",...(range?{criado_em:range}:{})}}),
    prisma.pagamentos.aggregate({ where: { tipo: "aluguel", status: "pago", ...(range ? { pago_em: range } : {}) }, _count: true, _sum: { valor: true } }),
    prisma.verificacoes_identidade.count({ where: { ...(range ? { criado_em: range } : {}) } }),
    prisma.suportes.count({ where: { ...(range ? { criado_em: range } : {}) } }),
    prisma.denuncias.count({ where: { ...(range ? { criado_em: range } : {}) } }),
    prisma.pagamentos.aggregate({ where: { tipo: "multa", status: "pago", ...(range ? { pago_em: range } : {}) }, _count: true, _sum: { valor: true } }),
    prisma.pagamentos.aggregate({ where: { status: "estorno_pendente", ...(range ? { status_em: range } : {}) }, _count: true, _sum: { valor: true } }),
    prisma.pagamentos.aggregate({ where: { status: "estornado", ...(range ? { status_em: range } : {}) }, _count: true, _sum: { valor: true } }),
    prisma.pagamentos.aggregate({ where: { status: "cancelamento_pendente", ...(range ? { status_em: range } : {}) }, _count: true, _sum: { valor: true } }),
    prisma.pagamentos.aggregate({ where: { status: "cancelado", ...(range ? { status_em: range } : {}) }, _count: true, _sum: { valor: true } }),
    prisma.alugueis.aggregate({ where: { eventos: { some: { status: "aprovado", ...(range ? { criado_em: range } : {}) } } }, _sum: { taxa_plataforma: true } }),
    prisma.alugueis.aggregate({ where: { pagamentos: { some: { tipo: "aluguel", status: "pago", ...(range ? { pago_em: range } : {}) } } }, _sum: { taxa_plataforma: true } }),
  ]);
  const finance = (a: typeof pagamentos) => ({ quantidade: a._count, valor: Number(a._sum.valor ?? 0) });
  res.json({ periodo: { dataInicio: req.query.dataInicio ?? null, dataFim: req.query.dataFim ?? null, timezone: "America/Sao_Paulo", base: "criado_em para cadastros; eventos_aluguel.criado_em para contratos; pago_em para pagos; status_em para cancelamentos e estornos" }, usuarios: { total: usuarios, ativos: usuariosAtivos }, objetos: { total: objetos, naoArquivados: objetosVisiveis }, alugueis: { total: alugueis, contratados }, pagamentos: { aluguel: finance(pagamentos), aprovados: finance(pagamentos), multas: finance(multas), estornosPendentes:finance(estornosPendentes),estornosConcluidos:finance(estornosConcluidos),cancelamentosPendentes:finance(cancelamentosPendentes),cancelamentosConcluidos:finance(cancelamentosConcluidos),taxaPlataformaContratada:Number(taxaContratada._sum.taxa_plataforma??0),taxaPlataformaRecebida:Number(taxaRecebida._sum.taxa_plataforma??0) }, verificacoes: { total: verificacoes }, suporte: { total: suporte }, denuncias: { total: denuncias } });
};
// Filtra e pagina usuários para o painel, sem expor o hash de senha.
export const listUsers: RequestHandler = async (req, res) => {
  const { page, limit, skip } = pagination(req, 25);
  const [rows, total] = await Promise.all([prisma.usuarios.findMany({ skip, take: limit, orderBy: { criado_em: "desc" }, select: { id: true, nome: true, email: true, tipo: true, ativo: true, verificado: true, criado_em: true, foto_url: true } }), prisma.usuarios.count()]);
  res.json({ dados: rows, total, pagina: page, paginas: Math.ceil(total / limit) });
};
// Consulta pendências que condicionam alterações administrativas da conta.
async function obligations(tx: any, id: string) {
  const [rentals, finance] = await Promise.all([
    tx.alugueis.count({ where: { OR: [{ locador_id: id }, { locatario_id: id }], status: { in: activeStatuses } } }),
    tx.pagamentos.count({ where: { alugueis: { OR: [{ locador_id: id }, { locatario_id: id }] }, status: { in: ["pendente", "conciliacao", "estorno_pendente", "cancelamento_pendente"] } } }),
  ]);
  if (rentals || finance) throw new HttpError(409, "Usuário possui obrigações ativas", "usuario_com_obrigacoes_ativas");
}
// Altera atividade da conta após verificar obrigações e registra auditoria.
export const updateUserStatus: RequestHandler = async (req, res) => {
  const id = uuid(req.params.id), active = requiredBoolean(req.body?.ativo);
  if (id === req.user!.id && !active) throw new HttpError(409, "Você não pode suspender sua própria conta");
  const user = await prisma.$transaction(async tx => {
    await tx.$queryRaw`SELECT id FROM usuarios WHERE id=${id}::uuid FOR UPDATE`;
    const current = await tx.usuarios.findUnique({ where: { id } });
    if (!current) throw new HttpError(404, "Usuário não encontrado");
    if (current.ativo === active) return { id: current.id, nome: current.nome, email: current.email, ativo: current.ativo, tipo: current.tipo };
    // Desativação exige ausência de obrigações; reativação exige CPF válido.
    // A versão do token muda para invalidar sessões anteriores.
    if (!active) await obligations(tx, id);
    else { try { cpf(current.cpf); } catch { throw new HttpError(409, "CPF ausente ou inválido; corrija antes de reativar", "cpf_invalido_reativacao"); } }
    const updated = await tx.usuarios.update({ where: { id }, data: { ativo: active, token_version: { increment: 1 }, atualizado_em: new Date() }, select: { id: true, nome: true, email: true, ativo: true, tipo: true } });
    await audit(tx, req.user!.id, active ? "reativar" : "desativar", "usuario", id);
    return updated;
  });
  res.json({ success: true, usuario: user });
};
// Solicita remoção administrativa da conta com as verificações do serviço.
export const deleteUser: RequestHandler = async (req, res) => {
  const id = uuid(req.params.id);
  if (id === req.user!.id) throw new HttpError(409, "Você não pode excluir sua própria conta");
  await removeAccount(id, false, req.user!.id);
  res.json({ success: true });
};
// Lista anúncios com filtros e paginação para moderação.
export const listAdminItems: RequestHandler = async (req, res) => {
  const { page, limit, skip } = pagination(req);
  const status=statusFilter(req,["ativo","arquivado"]);
  const where = { ...(status === "arquivado" ? { arquivado: true } : status === "ativo" ? { arquivado: false } : {}) };
  const [data, total] = await Promise.all([prisma.itens.findMany({ where, skip, take: limit, orderBy: { criado_em: "desc" }, select: { id: true, usuario_id: true, titulo: true, preco_por_dia: true, disponivel: true, arquivado: true, criado_em: true, categorias: { select: { nome: true, slug: true } }, usuarios: { select: { id: true, nome: true } }, fotos_item: { where: { principal: true }, take: 1, select: { url: true } } } }), prisma.itens.count({ where })]);
  res.json(paged(data.map(row=>({...row,preco_por_dia:Number(row.preco_por_dia)})), total, page, limit));
};
// Lista locações com filtros e paginação para acompanhamento.
export const listAdminRentals: RequestHandler = async (req, res) => {
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
