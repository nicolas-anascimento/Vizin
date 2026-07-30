import crypto from "node:crypto";
import type { RequestHandler } from "express";
import prisma from "../config/database.ts";
import { HttpError } from "../utils/httpError.ts";
import { removeUploadByUrl } from "../utils/files.ts";
import { serializeItem, serializeRental } from "../utils/serializers.ts";
import { asBoolean } from "../utils/strings.ts";

function positiveInteger(value: unknown, fallback: number, maximum?: number): number {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1) return fallback;
  return maximum ? Math.min(maximum, parsed) : parsed;
}

function requiredBoolean(value: unknown): boolean {
  const valid = typeof value === "boolean" || ["true", "false", "1", "0", "on", "off"].includes(String(value).toLowerCase());
  if (!valid) throw new HttpError(422, "O campo ativo deve ser verdadeiro ou falso");
  return asBoolean(value);
}

export const metrics: RequestHandler = async (_req, res) => {
  const [usuarios, objetos, alugueis, pagamentos] = await Promise.all([
    prisma.usuarios.count({ where: { ativo: true } }),
    prisma.itens.count({ where: { arquivado: false } }),
    prisma.alugueis.count(),
    prisma.pagamentos.aggregate({ where: { status: "pago" }, _sum: { valor: true }, _count: true }),
  ]);
  res.json({ usuarios, objetos, alugueis, pagamentos: pagamentos._count, volume: Number(pagamentos._sum.valor ?? 0) });
};

export const listUsers: RequestHandler = async (req, res) => {
  const page = positiveInteger(req.query.page, 1);
  const limit = positiveInteger(req.query.limit, 25, 100);
  const [rows, total] = await Promise.all([
    prisma.usuarios.findMany({
      skip: (page - 1) * limit,
      take: limit,
      orderBy: { criado_em: "desc" },
      select: { id: true, nome: true, email: true, tipo: true, ativo: true, verificado: true, criado_em: true, foto_url: true },
    }),
    prisma.usuarios.count(),
  ]);
  res.json({ dados: rows, total, pagina: page, paginas: Math.max(1, Math.ceil(total / limit)) });
};

export const updateUserStatus: RequestHandler = async (req, res) => {
  const active = requiredBoolean(req.body?.ativo);
  if (req.params.id === req.user!.id && !active) throw new HttpError(409, "Você não pode suspender sua própria conta");
  const user = await prisma.usuarios.update({
    where: { id: req.params.id },
    data: { ativo: active, token_version: { increment: 1 }, atualizado_em: new Date() },
    select: { id: true, nome: true, email: true, ativo: true, tipo: true },
  });
  res.json({ success: true, usuario: user });
};

export const deleteUser: RequestHandler = async (req, res) => {
  if (req.params.id === req.user!.id) throw new HttpError(409, "Você não pode excluir sua própria conta");
  const active = await prisma.alugueis.findFirst({
    where: {
      OR: [{ locador_id: req.params.id }, { locatario_id: req.params.id }],
      status: { in: ["pendente", "aprovado", "pago", "retirado"] },
    },
  });
  if (active) throw new HttpError(409, "O usuário possui aluguel ativo");
  const current = await prisma.usuarios.findUnique({ where: { id: req.params.id }, select: { foto_url: true } });
  if (!current) throw new HttpError(404, "Usuário não encontrado");
  await prisma.$transaction([
    prisma.itens.updateMany({
      where: { usuario_id: req.params.id },
      data: { arquivado: true, disponivel: false, atualizado_em: new Date() },
    }),
    prisma.usuarios.update({
      where: { id: req.params.id },
      data: {
        ativo: false,
        token_version: { increment: 1 },
        nome: "Usuário removido",
        email: `removido-${crypto.randomUUID()}@invalid.local`,
        telefone: null,
        cpf: null,
        bio: null,
        foto_url: null,
        atualizado_em: new Date(),
      },
    }),
  ]);
  await removeUploadByUrl(current.foto_url);
  res.json({ success: true });
};

export const listAdminItems: RequestHandler = async (_req, res) => {
  const rows = await prisma.itens.findMany({
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
    orderBy: { criado_em: "desc" },
  });
  res.json(rows.map(serializeItem));
};

export const listAdminRentals: RequestHandler = async (_req, res) => {
  const rows = await prisma.alugueis.findMany({
    include: {
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
      usuarios_alugueis_locador_idTousuarios: { select: { id: true, nome: true, email: true } },
      usuarios_alugueis_locatario_idTousuarios: { select: { id: true, nome: true, email: true } },
      pagamentos: true,
    },
    orderBy: { criado_em: "desc" },
  });
  res.json(rows.map(serializeRental));
};
