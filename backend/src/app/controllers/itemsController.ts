import { maintainRentals } from "../services/rentalMaintenance.ts";
import { categoryNames } from "../config/categories.ts";
import type { Request, RequestHandler } from "express";
import prisma from "../config/database.ts";
import { slug, uuid, boolean, text } from "../utils/validation.ts";
import { HttpError } from "../utils/httpError.ts";
import { publicUploadUrl, removeUploadByUrl } from "../utils/files.ts";
import { serializeItem } from "../utils/serializers.ts";
import { asBoolean, asPositiveNumber, nonEmptyString } from "../utils/strings.ts";
import { pageHeaders, pagination } from "../utils/listPage.ts";


type ItemPhoto = { item_id: string; id: string; url: string; principal: boolean | null };

// Carrega fotos, categoria, endereço, proprietário e avaliações usados no DTO do objeto.
const itemInclude = {
  avaliacoes: { where: { contexto: "objeto" }, select: { nota: true } },
  fotos_item: true,
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
};

// Executado sob bloqueio do anúncio; a criação de solicitações também bloqueia essa linha.
// Sob bloqueio do anúncio, impede alterações incompatíveis com locação ativa ou pedido pendente.
async function assertItemMutation(tx: Pick<typeof prisma, "alugueis" | "$queryRaw">, itemId: string, deleting: boolean, availabilityChanged = false): Promise<void> {
  await tx.$queryRaw`SELECT id FROM alugueis WHERE item_id=${itemId}::uuid FOR UPDATE`;
  if (await tx.alugueis.count({ where: { item_id: itemId, status: { in: ["aprovado", "pago", "retirado", "devolvido"] } } })) {
    throw new HttpError(409, "O objeto possui uma locação ativa.", "OBJETO_EM_LOCACAO");
  }
  if ((deleting || availabilityChanged) && await tx.alugueis.count({ where: { item_id: itemId, status: "pendente" } })) {
    throw new HttpError(409, "O objeto possui uma solicitação pendente.", "OBJETO_COM_SOLICITACAO_PENDENTE");
  }
}

// Seleciona a foto principal dentro dos índices válidos enviados pelo formulário.
function photoIndex(value: unknown, total: number): number {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= 0 && parsed < total ? parsed : 0;
}

// Normaliza os formatos de arquivos produzidos pelos diferentes middlewares de upload.
function uploadedFiles(req: Request): Express.Multer.File[] {
  if (Array.isArray(req.files)) return req.files;
  if (!req.files) return [];
  return Object.values(req.files).flat();
}

// Resolve categoria por UUID ou slug e só cria nomes previstos no catálogo.
async function categoryId(name: string): Promise<string> {
  const normalized = slug(name);
  if (!normalized || normalized.length > 100) throw new HttpError(422, "Categoria inválida");
  const byId = /^[0-9a-f-]{36}$/i.test(name) ? await prisma.categorias.findUnique({ where: { id: name } }) : null;
  if (byId) return byId.id;
  const existing = await prisma.categorias.findUnique({ where: { slug: normalized } });
  if (existing) return existing.id;
  if (!categoryNames[normalized]) throw new HttpError(422, "Categoria não cadastrada");
  const category = await prisma.categorias.upsert({ where: { slug: normalized }, update: {}, create: { nome: categoryNames[normalized], slug: normalized } });
  return category.id;
}

// Aceita nomes atuais e legados dos campos e valida preço, textos e opções do anúncio.
function itemData(body: Record<string, unknown>) {
  const titulo = nonEmptyString(body.titulo ?? body.nome);
  const descricao = nonEmptyString(body.descricao);
  const categoria = nonEmptyString(body.categoria_id ?? body.categoria);
  const preco = asPositiveNumber(body.preco_dia ?? body.preco_por_dia ?? body.preco);
  const localizacao = nonEmptyString(body.localizacao ?? body.localizacao_texto);
  const valorMercado = asPositiveNumber(body.valor_mercado) ?? (preco ? preco * 30 : null);
  if (!titulo || !descricao || !categoria || !preco || !localizacao || !valorMercado) {
    throw new HttpError(422, "Título, descrição, categoria, preço e localização são obrigatórios");
  }
  text(titulo, "Título", 150); text(descricao, "Descrição", 10000); text(localizacao, "Localização", 200); text(categoria, "Categoria", 80);
  if (titulo.length > 150 || descricao.length > 10000 || localizacao.length > 200 || preco > 1000000 || valorMercado > 10000000) throw new HttpError(422, "Campos excedem os limites");
  for (const field of ["disponivel", "disponivel_imediato", "segurado"]) if (body[field] !== undefined && body[field] !== null) boolean(body[field], field);
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

// Monta filtros públicos, inclusive busca geográfica no PostGIS, e pagina os objetos visíveis.
export const listItems: RequestHandler = async (req, res) => {
  const busca = nonEmptyString(req.query.busca ?? req.query.texto ?? req.query.q);
  const local = nonEmptyString(req.query.local ?? req.query.localizacao);
  const categoria = nonEmptyString(req.query.categoria);
  const ownerId = req.query.proprietarioId ?? req.query.proprietario_id;
  const where: any = { arquivado: false, usuarios: { ativo: true } };
  if (ownerId) where.usuario_id = uuid(ownerId);
  if (req.query.disponivel !== undefined) where.disponivel = boolean(req.query.disponivel, "Disponível");
  else if (!ownerId || ownerId !== req.user?.id) where.disponivel = true;
  const min = req.query.precoMin ?? req.query.preco_min;
  const max = req.query.precoMax ?? req.query.preco_max;
  if (min !== undefined || max !== undefined) {
    if ((min !== undefined && (!Number.isFinite(Number(min)) || Number(min) < 0)) || (max !== undefined && (!Number.isFinite(Number(max)) || Number(max) < 0))) throw new HttpError(422, "Preço inválido");
    where.preco_por_dia = { ...(min !== undefined ? { gte: Number(min) } : {}), ...(max !== undefined ? { lte: Number(max) } : {}) };
  }
  // A busca geográfica usa endereços dentro do raio calculado em metros pelo PostGIS.
  const latitude = req.query.latitude;
  const longitude = req.query.longitude;
  if (latitude !== undefined || longitude !== undefined) {
    const lat = Number(latitude), lon = Number(longitude), radius = Number(req.query.raio ?? 10);
    if (latitude === undefined || longitude === undefined || !Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat)>90 || Math.abs(lon)>180 || !Number.isFinite(radius) || radius <= 0 || radius > 500) throw new HttpError(422, "Coordenadas/raio inválidos");
    const addresses = await prisma.$queryRaw<{ id: string }[]>`SELECT id FROM enderecos WHERE ST_DWithin(localizacao, ST_SetSRID(ST_MakePoint(${lon},${lat}),4326)::geography, ${radius * 1000})`;
    where.endereco_id = { in: addresses.map(a => a.id) };
  }
  const filters: any[] = [];
  if (busca) {
    filters.push({ OR: [
      { titulo: { contains: busca, mode: "insensitive" } },
      { descricao: { contains: busca, mode: "insensitive" } },
    ] });
  }
  if (local) filters.push({ localizacao_texto: { contains: local, mode: "insensitive" } });
  if (categoria) filters.push(/^[0-9a-f-]{36}$/i.test(categoria) ? { categoria_id: categoria } : { categorias: { slug: slug(categoria) } });
  if (filters.length) where.AND = filters;
  const page = Math.max(1, Number(req.query.page ?? req.query.pagina ?? 1) || 1);
  const limit = Math.min(100, Math.max(1, Number(req.query.limit ?? req.query.limite ?? 30) || 30));
  if (!Number.isInteger(page) || !Number.isInteger(limit)) throw new HttpError(422, "Paginação inválida");
  const order: any = req.query.ordenacao === "preco_asc" ? { preco_por_dia: "asc" } : req.query.ordenacao === "preco_desc" ? { preco_por_dia: "desc" } : { criado_em: "desc" };
  const total = await prisma.itens.count({ where });
  res.setHeader("X-Total-Count", total);
  const items = await prisma.itens.findMany({ where, include: itemInclude, orderBy: order, skip: (page - 1) * limit, take: limit });
  res.json(items.map(serializeItem));
};

// Lista somente anúncios não arquivados do usuário autenticado, com total para paginação.
export const myItems: RequestHandler = async (req, res) => {
  const {page,limit,skip}=pagination(req);
  const where={usuario_id:req.user!.id,arquivado:false};
  const [items,total] = await Promise.all([prisma.itens.findMany({
    where,
    include: itemInclude,
    orderBy: { criado_em: "desc" },
    skip,take:limit,
  }),prisma.itens.count({where})]);
  pageHeaders(res,total,page,limit);
  res.json(items.map(serializeItem));
};

// Mostra anúncio pelo UUID; conteúdo arquivado ou de conta inativa só é visível ao dono ou admin.
export const getItem: RequestHandler = async (req, res) => {
  const item = await prisma.itens.findUnique({ where: { id: uuid(req.params.id) }, include: itemInclude });
  if (!item || ((!item.usuarios.ativo || item.arquivado) && item.usuario_id !== req.user?.id && req.user?.tipo !== "admin")) {
    throw new HttpError(404, "Objeto não encontrado");
  }
  res.json(serializeItem(item));
};

// Exige foto e formulário multipart, confirma categoria e endereço próprio e cria anúncio com fotos.
export const createItem: RequestHandler = async (req, res) => {
  const data = itemData(req.body as Record<string, unknown>);
  const files = uploadedFiles(req);
  if (!req.is("multipart/form-data")) throw new HttpError(422, "Use multipart/form-data");
  if (files.length > 5) throw new HttpError(422, "O objeto pode ter no máximo cinco fotos");
  if (files.length === 0) throw new HttpError(422, "Adicione ao menos uma foto do objeto");
  const categoria = await categoryId(data.categoria);
  const addressId = req.body?.endereco_id ?? req.body?.enderecoId;
  const address = addressId ? await prisma.enderecos.findFirst({ where: { id: uuid(addressId), usuario_id: req.user!.id } }) : await prisma.enderecos.findFirst({ where: { usuario_id: req.user!.id, principal: true } });
  if (addressId && !address) throw new HttpError(422, "Endereço inválido");
  // Cria anúncio e fotos na mesma escrita; o preço diário armazenado será usado nas solicitações.
  const item = await prisma.itens.create({
    data: {
      usuario_id: req.user!.id,
      categoria_id: categoria,
      endereco_id: address?.id ?? null,
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

// Confere propriedade e campos enviados antes de atualizar anúncio, endereço, categoria e fotos.
export const updateItem: RequestHandler = async (req, res) => {
  const current = await prisma.itens.findUnique({
    where: { id: uuid(req.params.id) },
    include: { fotos_item: true, categorias: true },
  });
  if (!current) throw new HttpError(404, "Objeto não encontrado");
  if (current.usuario_id !== req.user!.id) throw new HttpError(403, "Você não pode editar este objeto");
  const body = (req.body ?? {}) as Record<string, unknown>;
  if (body.disponivel !== undefined) boolean(body.disponivel, "Disponível");
  const price = body.preco_dia ?? body.preco_por_dia ?? body.preco;
  const mercado = body.valor_mercado;
  const data = {
    titulo: body.titulo !== undefined || body.nome !== undefined ? text(body.titulo ?? body.nome,"Título",150) : current.titulo,
    descricao: body.descricao !== undefined ? text(body.descricao,"Descrição",10000) : current.descricao,
    preco: price !== undefined ? asPositiveNumber(price) : Number(current.preco_por_dia),
    valorMercado: mercado !== undefined ? asPositiveNumber(mercado) : Number(current.valor_mercado),
    localizacao: body.localizacao !== undefined || body.localizacao_texto !== undefined ? text(body.localizacao ?? body.localizacao_texto,"Localização",200) : current.localizacao_texto,
    disponivel: body.disponivel_imediato !== undefined || body.disponivel !== undefined ? boolean(body.disponivel_imediato ?? body.disponivel,"Disponível") : current.disponivel,
    segurado: body.segurado !== undefined ? boolean(body.segurado,"Segurado") : current.segurado,
    condicao: body.condicao !== undefined ? text(body.condicao,"Condição",20) : current.condicao,
  };
  if (data.preco === null || data.valorMercado === null || data.preco > 1000000 || data.valorMercado > 10000000) throw new HttpError(422,"Preço inválido");
  const preco = data.preco;
  const valorMercado = data.valorMercado;
  let addressId = current.endereco_id;
  if (body.endereco_id !== undefined || body.enderecoId !== undefined) {
    addressId = uuid(body.endereco_id ?? body.enderecoId);
    if (!await prisma.enderecos.findFirst({ where: { id: addressId, usuario_id: current.usuario_id } })) throw new HttpError(422, "Endereço inválido");
  }
  const category = body.categoria_id !== undefined || body.categoria !== undefined ? await categoryId(text(body.categoria_id ?? body.categoria,"Categoria",80)) : current.categoria_id;
  let keptIds: string[] = [...current.fotos_item].sort((a,b) => Number(!!b.principal)-Number(!!a.principal)).map((photo: ItemPhoto) => photo.id);
  if (body.fotos_mantidas !== undefined) {
    let parsed: unknown;
    try { parsed = typeof body.fotos_mantidas === "string" ? JSON.parse(body.fotos_mantidas) : body.fotos_mantidas; } catch { throw new HttpError(422,"fotos_mantidas inválido"); }
    if(!Array.isArray(parsed) || parsed.some(id=>typeof id!=="string") || new Set(parsed).size!==parsed.length || parsed.some(id=>!current.fotos_item.some(p=>p.id===id))) throw new HttpError(422,"fotos_mantidas deve conter IDs únicos do anúncio");
    keptIds=parsed;
  }
  const validKept = keptIds
    .map((id) => current.fotos_item.find((photo: ItemPhoto) => photo.id === id))
    .filter((photo): photo is ItemPhoto => Boolean(photo));
  const newFiles = uploadedFiles(req);
  const editingPhotos = newFiles.length > 0 || body.fotos_mantidas !== undefined || body.foto_principal_index !== undefined;
  if (editingPhotos && validKept.length + newFiles.length === 0) throw new HttpError(422, "O objeto precisa ter pelo menos uma foto");
  if (editingPhotos && validKept.length + newFiles.length > 5) throw new HttpError(422, "O objeto pode ter no máximo cinco fotos");
  const removed = current.fotos_item.filter((photo: ItemPhoto) => !keptIds.includes(photo.id));
  // Bloqueia o anúncio ao editar. A verificação de fotos impede sobrescrever alterações
  // feitas por outra requisição enquanto este formulário estava aberto.
  const updated = await prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM itens WHERE id=${current.id}::uuid FOR UPDATE`;
    const locked = await tx.itens.findUnique({ where: { id: current.id } });
    if (!locked || locked.arquivado) throw new HttpError(404, "Objeto não encontrado");
    if (locked.usuario_id !== req.user!.id) throw new HttpError(403, "Você não pode editar este objeto");
    await assertItemMutation(tx, current.id, false,
      (body.disponivel !== undefined || body.disponivel_imediato !== undefined) && data.disponivel !== locked.disponivel);
    if (editingPhotos) {
      const snapshot=await tx.fotos_item.findMany({where:{item_id:current.id}});
      if(snapshot.length!==current.fotos_item.length || snapshot.some(p=>!current.fotos_item.some(old=>old.id===p.id))) throw new HttpError(409,"Fotos alteradas; recarregue o anúncio", "FOTOS_ALTERADAS");
      await tx.fotos_item.updateMany({ where: { item_id: current.id }, data: { principal: false } });
      if (removed.length) await tx.fotos_item.deleteMany({ where: { id: { in: removed.map((photo: ItemPhoto) => photo.id) } } });
      const created = [];
      for (const file of newFiles) {
        created.push(await tx.fotos_item.create({ data: { item_id: current.id, url: publicUploadUrl(file.path), principal: false } }));
      }
      const finalPhotos = [...validKept, ...created];
      const principalId = req.body?.foto_principal_index !== undefined ? finalPhotos[photoIndex(req.body.foto_principal_index, finalPhotos.length)]?.id : validKept.find(p => p.principal)?.id ?? finalPhotos[0]?.id;
      if (principalId) await tx.fotos_item.update({ where: { id: principalId }, data: { principal: true } });
    }
    return tx.itens.update({
      where: { id: current.id },
      data: {
        ...(body.categoria_id !== undefined || body.categoria !== undefined ? { categoria_id: category } : {}),
        ...(body.endereco_id !== undefined || body.enderecoId !== undefined ? { endereco_id: addressId } : {}),
        ...(body.titulo !== undefined || body.nome !== undefined ? { titulo: data.titulo } : {}),
        ...(body.descricao !== undefined ? { descricao: data.descricao } : {}),
        ...(price !== undefined ? { preco_por_dia: preco } : {}),
        ...(mercado !== undefined ? { valor_mercado: valorMercado } : {}),
        ...(body.localizacao !== undefined || body.localizacao_texto !== undefined ? { localizacao_texto: data.localizacao } : {}),
        ...(body.disponivel !== undefined || body.disponivel_imediato !== undefined ? { disponivel: data.disponivel } : {}),
        ...(body.condicao !== undefined ? { condicao: data.condicao } : {}),
        ...(body.segurado !== undefined ? { segurado: data.segurado } : {}),
        atualizado_em: new Date(),
      },
      include: itemInclude,
    });
  });
  await Promise.all(removed.map((photo: ItemPhoto) => removeUploadByUrl(photo.url)));
  res.json({ success: true, objeto: serializeItem(updated), ...serializeItem(updated) });
};

// Remove ou arquiva anúncio do proprietário, conforme seu histórico de locações.
export const deleteItem: RequestHandler = async (req, res) => {
  const item = await prisma.itens.findUnique({ where: { id: uuid(req.params.id) }, include: { fotos_item: true } });
  if (!item) throw new HttpError(404, "Objeto não encontrado");
  if (item.usuario_id !== req.user!.id) throw new HttpError(403, "Você não pode excluir este objeto");
  // Se já houve aluguel, mantém o registro arquivado para preservar o histórico;
  // sem histórico, remove o anúncio e depois os arquivos de suas fotos.
  const hasHistory = await prisma.$transaction(async tx => {
    await tx.$queryRaw`SELECT id FROM itens WHERE id=${item.id}::uuid FOR UPDATE`;
    const locked = await tx.itens.findUnique({ where: { id: item.id } });
    if (!locked || locked.arquivado) throw new HttpError(404, "Objeto não encontrado");
    if (locked.usuario_id !== req.user!.id) throw new HttpError(403, "Você não pode excluir este objeto");
    await assertItemMutation(tx, item.id, true);
    const history = await tx.alugueis.findFirst({ where: { item_id: item.id } });
    if (history) {
      await tx.itens.update({ where: { id: item.id }, data: { arquivado: true, disponivel: false, atualizado_em: new Date() } });
    } else {
      await tx.itens.delete({ where: { id: item.id } });
    }
    return Boolean(history);
  });
  if (!hasHistory) await Promise.all(item.fotos_item.map((photo: ItemPhoto) => removeUploadByUrl(photo.url)));
  res.json({ success: true, arquivado: Boolean(hasHistory) });
};

// Devolve as categorias cadastradas para filtros e formulários de objeto.
export const listCategories: RequestHandler = async (_req, res) => {
  const categories = await prisma.categorias.findMany({ orderBy: { nome: "asc" } });
  res.json(categories.map(({ id, nome, slug }) => ({ id, nome, slug })));
};

// Calcula períodos ocupados do objeto após encerrar solicitações vencidas.
export const itemAvailability: RequestHandler = async(req,res) => {
 await maintainRentals();
 const item=await prisma.itens.findUnique({where:{id:uuid(req.params.id)},include:{usuarios:{select:{ativo:true}},alugueis:{where:{status:{in:["aprovado","pago","retirado"]}},select:{data_inicio:true,data_fim:true,status:true}}}});
 if(!item || item.arquivado || !item.usuarios.ativo)throw new HttpError(404,"Objeto não encontrado");
 res.json({objetoId:item.id,disponivel:item.disponivel,periodosReservados:item.alugueis.map(r=>({data_inicio:r.data_inicio.toISOString().slice(0,10),data_fim:r.data_fim.toISOString().slice(0,10),status:r.status}))});
};
