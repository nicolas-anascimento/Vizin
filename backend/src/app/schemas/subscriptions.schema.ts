import { z } from "zod";

export const subscriptionBodySchema = z.strictObject({
  plano_codigo: z.string().trim().min(1).max(30).optional(),
  plano: z.string().trim().min(1).max(30).optional(),
  metodo: z.string().trim().min(1).max(30).optional(),
  token_cartao: z.string().trim().min(1).max(300).optional(),
  payment_method_id: z.string().trim().min(1).max(80).optional(),
  device_id: z.string().trim().max(200).optional(),
  // Clientes legados enviam preço; o servidor o ignora e usa o plano persistido.
  preco_centavos: z.unknown().optional(),
}).refine(value => Boolean(value.plano_codigo ?? value.plano), { path: ["plano_codigo"], message: "Plano obrigatório" });

export const idempotencyKeySchema = z.string().regex(/^[A-Za-z0-9._:-]{1,120}$/);
const providerResourceSchema = z.union([z.string().min(1), z.number().int()]);
export const subscriptionWebhookSchema = z.object({
  id: providerResourceSchema,
  type: z.string(),
  data: z.object({ id: providerResourceSchema }),
});

export type SubscriptionBody = z.output<typeof subscriptionBodySchema>;
export type SubscriptionWebhook = z.output<typeof subscriptionWebhookSchema>;
