import { z } from "zod";
import { booleanSchema } from "./common.ts";

// Criação e edição compartilham o payload parcial; os campos obrigatórios são
// conferidos após combinar o endereço existente com o patch.
const coordinate = z.union([z.number().finite(), z.string(), z.null()]);
export const addressPatchSchema = z.object({
  cep: z.string().max(10).optional(),
  rua: z.string().max(200).optional(),
  numero: z.string().max(10).optional(),
  bairro: z.string().max(100).optional(),
  cidade: z.string().max(100).optional(),
  estado: z.string().max(2).optional(),
  complemento: z.string().max(100).nullable().optional(),
  principal: booleanSchema.nullable().optional(),
  latitude: coordinate.optional(),
  longitude: coordinate.optional(),
}).passthrough();
