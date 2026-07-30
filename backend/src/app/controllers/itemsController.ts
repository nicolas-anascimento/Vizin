import type { Request, RequestHandler } from "express";
import prisma from "../config/database.ts";
import { HttpError } from "../utils/httpError.ts";
import { publicUploadUrl, removeUploadByUrl } from "../utils/files.ts";
import { serializeItem } from "../utils/serializers.ts";
import { asBoolean, asPositiveNumber, nonEmptyString } from "../utils/strings.ts";


type ItemPhoto = { id: string; url: string; principal: boolean | null };

const itemInclude = {
  fotos_item: true,
  categorias: true,
  enderecos: true,
  usuarios: {
    select: {
      id: true,
      nome: true,
      foto_url: true,
      ativo: true,
      avaliacoes_avaliacoes_avaliado_idTousuarios: { select: { nota: true } },
    },
  },
};

function photoIndex(value: unknown, total: number): number {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= 0 && parsed < total ? parsed : 0;
}

function uploadedFiles(req: Request): Express.Multer.File[] {
  if (Array.isArray(req.files)) return req.files;
  if (!req.files) return [];
  return Object.values(req.files).flat();
}

async function categoryId(name: string): Promise<string> {
  const normalized = name.trim();
  const category = await prisma.categorias.upsert({
    where: { nome: normalized },
    update: {},
    create: { nome: normalized },
  });
  return category.id;
}

function itemData(body: Record<string, unknown>) {
  const titulo = nonEmptyString(body.titulo);
  const descricao = nonEmptyString(body.descricao);
  const categoria = nonEmptyString(body.categoria);
  const preco = asPositiveNumber(body.preco_dia ?? body.preco_por_dia ?? body.preco);
  const localizacao = nonEmptyString(body.localizacao ?? body.localizacao_texto);
  const valorMercado = asPositiveNumber(body.valor_mercado) ?? (preco ? preco * 30 : null);
  if (!titulo || !descricao || !categoria || !preco || !localizacao || !valorMercado) {
    throw new HttpError(422, "Título, descrição, categoria, preço e localização são obrigatórios");
  }
  return {
    titulo,
    descricao,
    categoria,
    preco,
    localizacao,
    valorMercado,
    disponivel: asBoolean(body.disponivel_imediato ?? body.disponivel, true),
    condicao: nonEmptyString(body.condicao),
    segurado: asBoolean(body.segurado, false),
  };
}

export const listItems: RequestHandler = async (req, res) => {
  const busca = nonEmptyString(req.query.busca);
  const local = nonEmptyString(req.query.local);
  const categoria = nonEmptyString(req.query.categoria);
  const where: any = { disponivel: true, arquivado: false, usuarios: { ativo: true } };
  const filters: any[] = [];
  if (busca) {
    filters.push({ OR: [
      { titulo: { contains: busca, mode: "insensitive" } },
      { descricao: { contains: busca, mode: "insensitive" } },
    ] });
  }
  if (local) filters.push({ localizacao_texto: { contains: local, mode: "insensitive" } });
  if (categoria) filters.push({ categorias: { nome: { equals: categoria, mode: "insensitive" } } });
  if (filters.length) where.AND = filters;
  const items = await prisma.itens.findMany({ where, include: itemInclude, orderBy: { criado_em: "desc" } });
  res.json(items.map(serializeItem));
};

export const myItems: RequestHandler = async (req, res) => {
  const items = await prisma.itens.findMany({
    where: { usuario_id: req.user!.id, arquivado: false },
    include: itemInclude,
    orderBy: { criado_em: "desc" },
  });
  res.json(items.map(serializeItem));
};

export const getItem: RequestHandler = async (req, res) => {
  const item = await prisma.itens.findUnique({ where: { id: req.params.id }, include: itemInclude });
  if (!item || ((!item.usuarios.ativo || item.arquivado) && item.usuario_id !== req.user?.id && req.user?.tipo !== "admin")) {
    throw new HttpError(404, "Objeto não encontrado");
  }
  res.json(serializeItem(item));
};

export const createItem: RequestHandler = async (req, res) => {
  const data = itemData(req.body as Record<string, unknown>);
  const files = uploadedFiles(req);
  if (files.length === 0) throw new HttpError(422, "Adicione ao menos uma foto do objeto");
  const categoria = await categoryId(data.categoria);
  const item = await prisma.itens.create({
    data: {
      usuario_id: req.user!.id,
      categoria_id: categoria,
      titulo: data.titulo,
      descricao: data.descricao,
      preco_por_dia: data.preco,
      valor_mercado: data.valorMercado,
      localizacao_texto: data.localizacao,
      disponivel: data.disponivel,
      condicao: data.condicao,
      segurado: data.segurado,
      fotos_item: {
        create: files.map((file, index) => ({
          url: publicUploadUrl(file.path),
          principal: index === photoIndex(req.body?.foto_principal_index, files.length),
        })),
      },
    },
    include: itemInclude,
  });
  res.status(201).json({ success: true, objeto: serializeItem(item), ...serializeItem(item) });
};

export const updateItem: RequestHandler = async (req, res) => {
  const current = await prisma.itens.findUnique({
    where: { id: req.params.id },
    include: { fotos_item: true },
  });
  if (!current) throw new HttpError(404, "Objeto não encontrado");
  if (current.usuario_id !== req.user!.id && req.user!.tipo !== "admin") throw new HttpError(403, "Você não pode editar este objeto");
  const data = itemData(req.body as Record<string, unknown>);
  const category = await categoryId(data.categoria);
  let keptIds: string[] = current.fotos_item.map((photo: ItemPhoto) => photo.id);
  if (typeof req.body.fotos_mantidas === "string") {
    try {
      const parsed: unknown = JSON.parse(req.body.fotos_mantidas);
      if (Array.isArray(parsed)) keptIds = parsed.filter((id): id is string => typeof id === "string");
    } catch {
      throw new HttpError(422, "fotos_mantidas inválido");
    }
  }
  const validKept = keptIds
    .map((id) => current.fotos_item.find((photo: ItemPhoto) => photo.id === id))
    .filter((photo): photo is ItemPhoto => Boolean(photo));
  const newFiles = uploadedFiles(req);
  if (validKept.length + newFiles.length === 0) throw new HttpError(422, "O objeto precisa ter pelo menos uma foto");
  if (validKept.length + newFiles.length > 5) throw new HttpError(422, "O objeto pode ter no máximo cinco fotos");
  const removed = current.fotos_item.filter((photo: ItemPhoto) => !keptIds.includes(photo.id));
  const updated = await prisma.$transaction(async (tx) => {
    await tx.fotos_item.updateMany({ where: { item_id: current.id }, data: { principal: false } });
    if (removed.length) await tx.fotos_item.deleteMany({ where: { id: { in: removed.map((photo: ItemPhoto) => photo.id) } } });
    const created = [];
    for (const file of newFiles) {
      created.push(await tx.fotos_item.create({ data: { item_id: current.id, url: publicUploadUrl(file.path), principal: false } }));
    }
    const finalPhotos = [...validKept, ...created];
    const principalId = finalPhotos[photoIndex(req.body?.foto_principal_index, finalPhotos.length)]?.id;
    if (principalId) await tx.fotos_item.update({ where: { id: principalId }, data: { principal: true } });
    return tx.itens.update({
      where: { id: current.id },
      data: {
        categoria_id: category,
        titulo: data.titulo,
        descricao: data.descricao,
        preco_por_dia: data.preco,
        valor_mercado: data.valorMercado,
        localizacao_texto: data.localizacao,
        disponivel: data.disponivel,
        condicao: data.condicao,
        segurado: data.segurado,
        atualizado_em: new Date(),
      },
      include: itemInclude,
    });
  });
  await Promise.all(removed.map((photo: ItemPhoto) => removeUploadByUrl(photo.url)));
  res.json({ success: true, objeto: serializeItem(updated), ...serializeItem(updated) });
};

export const deleteItem: RequestHandler = async (req, res) => {
  const item = await prisma.itens.findUnique({ where: { id: req.params.id }, include: { fotos_item: true } });
  if (!item) throw new HttpError(404, "Objeto não encontrado");
  if (item.usuario_id !== req.user!.id && req.user!.tipo !== "admin") throw new HttpError(403, "Você não pode excluir este objeto");
  const activeRental = await prisma.alugueis.findFirst({
    where: { item_id: item.id, status: { in: ["pendente", "aprovado", "pago", "retirado"] } },
  });
  if (activeRental) throw new HttpError(409, "Este objeto possui uma solicitação ou aluguel ativo");
  const hasHistory = await prisma.alugueis.findFirst({ where: { item_id: item.id } });
  if (hasHistory) {
    await prisma.itens.update({ where: { id: item.id }, data: { arquivado: true, disponivel: false, atualizado_em: new Date() } });
  } else {
    await prisma.itens.delete({ where: { id: item.id } });
    await Promise.all(item.fotos_item.map((photo: ItemPhoto) => removeUploadByUrl(photo.url)));
  }
  res.json({ success: true, arquivado: Boolean(hasHistory) });
};

export const listCategories: RequestHandler = async (_req, res) => {
  const categories = await prisma.categorias.findMany({ orderBy: { nome: "asc" } });
  res.json(categories);
};
