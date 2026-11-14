import { z } from "zod";
import { idSchema, textSchema } from "./common.ts";

// Prioridades desconhecidas continuam usando a prioridade padrão do serviço.
const priority = z.unknown().optional();
const optionalId = idSchema.optional().nullable();

export const helpBodySchema = z.object({
  assunto: textSchema(150),
  mensagem: textSchema(10000),
  prioridade: priority,
}).passthrough();

export const reportBodySchema = z.object({
  motivo: textSchema(150),
  assunto: textSchema(150).optional().nullable(),
  mensagem: textSchema(10000),
  contra: optionalId,
  usuarioId: optionalId,
  denunciado_id: optionalId,
  aluguelId: optionalId,
  aluguel_id: optionalId,
  produtoId: optionalId,
  objeto_id: optionalId,
  avaliacaoId: optionalId,
  avaliacao_id: optionalId,
  attachmentId: optionalId,
  anexoIds: z.array(idSchema).max(5).optional(),
  prioridade: priority,
}).passthrough();

export const claimBodySchema = z.object({
  aluguel_id: optionalId,
  aluguelId: optionalId,
  descricao: textSchema(10000).optional(),
  mensagem: textSchema(10000).optional(),
  valor_solicitado: z.union([z.number().finite().nonnegative(), z.string().trim().regex(/^\d+(?:\.\d+)?$/)]).optional(),
}).passthrough();
