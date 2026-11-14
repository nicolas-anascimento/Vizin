import { z } from "zod";
import { booleanSchema, idSchema, textSchema } from "./common.ts";
import { coordinateSchema, moneyFilterSchema, positivePageSchema } from "./query.schema.ts";

export const listItemsQuerySchema = z.object({
  busca: z.string().optional(), texto: z.string().optional(), q: z.string().optional(),
  local: z.string().optional(), localizacao: z.string().optional(), categoria: z.string().optional(),
  proprietarioId: idSchema.optional(), proprietario_id: idSchema.optional(),
  disponivel: booleanSchema.optional(),
  precoMin: moneyFilterSchema.optional(), preco_min: moneyFilterSchema.optional(),
  precoMax: moneyFilterSchema.optional(), preco_max: moneyFilterSchema.optional(),
  latitude: coordinateSchema.pipe(z.number().min(-90).max(90)).optional(),
  longitude: coordinateSchema.pipe(z.number().min(-180).max(180)).optional(),
  raio: coordinateSchema.pipe(z.number().positive().max(500)).optional(),
  page: positivePageSchema.optional(), pagina: positivePageSchema.optional(),
  limit: positivePageSchema.optional(), limite: positivePageSchema.optional(),
  ordenacao: z.string().optional(),
});

export type ListItemsQuery = z.output<typeof listItemsQuerySchema>;

const positiveAmount = (max: number) => z.union([z.number(), z.string().trim().min(1).transform(Number)]).pipe(z.number().finite().positive().max(max));
const optionalFlag = booleanSchema.nullable().optional();
export const itemDataSchema = z.object({
  titulo: z.unknown().optional(), nome: z.unknown().optional(), descricao: z.unknown().optional(),
  categoria_id: z.unknown().optional(), categoria: z.unknown().optional(),
  preco_dia: z.unknown().optional(), preco_por_dia: z.unknown().optional(), preco: z.unknown().optional(),
  localizacao: z.unknown().optional(), localizacao_texto: z.unknown().optional(), valor_mercado: z.unknown().optional(),
  disponivel: optionalFlag, disponivel_imediato: optionalFlag, segurado: optionalFlag,
  condicao: z.unknown().optional(),
}).transform(value => {
  const price = value.preco_dia ?? value.preco_por_dia ?? value.preco;
  return {
    titulo: value.titulo ?? value.nome,
    descricao: value.descricao,
    categoria: value.categoria_id ?? value.categoria,
    preco: price,
    localizacao: value.localizacao ?? value.localizacao_texto,
    valorMercado: value.valor_mercado ?? (price === undefined ? undefined : Number(price) * 30),
    disponivel: value.disponivel_imediato ?? value.disponivel ?? true,
    condicao: typeof value.condicao === "string" ? value.condicao.trim() || null : null,
    segurado: value.segurado ?? false,
  };
}).pipe(z.object({
  titulo: textSchema(150), descricao: textSchema(10000), categoria: textSchema(80),
  preco: positiveAmount(1_000_000), localizacao: textSchema(200), valorMercado: positiveAmount(10_000_000),
  disponivel: z.boolean(), condicao: z.string().nullable(), segurado: z.boolean(),
}));

export type ItemData = z.output<typeof itemDataSchema>;
