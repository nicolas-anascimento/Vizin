import assert from "node:assert/strict";
import test from "node:test";
import { z } from "zod";
import { cpfSchema, emailSchema, idSchema, passwordSchema } from "../app/schemas/common.ts";
import { itemDataSchema, listItemsQuerySchema } from "../app/schemas/objects.schema.ts";
import { subscriptionBodySchema, subscriptionWebhookSchema } from "../app/schemas/subscriptions.schema.ts";
import { InputValidationError } from "../app/middlewares/validate.ts";
import { environmentSchema } from "../app/config/env.ts";
import { conversationEventSchema, sendMessageEventSchema } from "../app/schemas/conversations.schema.ts";
import { helpBodySchema, reportBodySchema } from "../app/schemas/support.schema.ts";
import { addressPatchSchema } from "../app/schemas/addresses.schema.ts";

test("schemas preservam CPF formatado, email normalizado e UUID legado", () => {
  assert.equal(cpfSchema.parse("529.982.247-25"), "52998224725");
  assert.equal(emailSchema.parse(" Pessoa@Exemplo.com "), "pessoa@exemplo.com");
  assert.equal(idSchema.safeParse("123e4567-e89b-12d3-a456-426614174000").success, true);
  assert.equal(passwordSchema.safeParse("somenteletras").success, false);
});

test("query numérica rejeita tipos e limites inválidos; erro não inclui valor secreto", () => {
  const valid = listItemsQuerySchema.parse({ page: "2", precoMin: "0", latitude: "-23.5", longitude: "-46.6" });
  assert.equal(valid.page, 2);
  assert.equal(valid.precoMin, 0);
  for (const input of [{ page: "0" }, { page: "abc" }, { latitude: "91" }, { precoMin: "NaN" }]) {
    assert.equal(listItemsQuerySchema.safeParse(input).success, false);
  }
  const parsed = z.strictObject({ senha: z.string().min(8) }).safeParse({ senha: "x", extra: true });
  assert.equal(parsed.success, false);
  if (!parsed.success) {
    const error = new InputValidationError(parsed.error);
    assert.equal(error.codigo, "dados_invalidos");
    assert.ok(error.erros.senha?.length);
    assert.equal(JSON.stringify(error.erros).includes('"x"'), false);
  }
});

test("anúncio aceita aliases multipart e limita preço, textos e booleanos", () => {
  const valid = { nome: "Furadeira", descricao: "Funciona", categoria: "ferramentas", preco: "25", localizacao_texto: "São Paulo", disponivel: "true" };
  const parsed = itemDataSchema.parse(valid);
  assert.equal(parsed.titulo, "Furadeira");
  assert.equal(parsed.preco, 25);
  assert.equal(parsed.valorMercado, 750);
  assert.equal(parsed.disponivel, true);
  assert.equal(itemDataSchema.safeParse({ ...valid, preco: "1000001" }).success, false);
  assert.equal(itemDataSchema.safeParse({ ...valid, disponivel: "1" }).success, false);
  assert.equal(itemDataSchema.safeParse({ ...valid, localizacao_texto: "" }).success, false);
});

test("assinatura ignora preço legado e rejeita campos financeiros inesperados", () => {
  assert.equal(subscriptionBodySchema.safeParse({ plano_codigo: "intermediario", metodo: "pix", preco_centavos: 1 }).success, true);
  assert.equal(subscriptionBodySchema.safeParse({ plano_codigo: "avancado", metodo: "pix", valor_total: 1 }).success, false);
  assert.equal(subscriptionWebhookSchema.safeParse({ id: "1", type: "payment", data: { id: "2" } }).success, true);
  assert.equal(subscriptionWebhookSchema.safeParse({ type: "payment", data: {} }).success, false);
});

test("ambiente interpreta false corretamente e rejeita porta, origem e produção insegura", () => {
  const base = { DATABASE_URL: "postgresql://localhost/test", JWT_KEY: "x".repeat(32), SMTP_SECURE: "false" };
  assert.equal(environmentSchema.parse(base).SMTP_SECURE, false);
  assert.equal(environmentSchema.safeParse({ ...base, PORT: "abc" }).success, false);
  assert.equal(environmentSchema.safeParse({ ...base, DATABASE_URL: "not-a-url" }).success, false);
  assert.equal(environmentSchema.safeParse({ ...base, FRONTEND_ORIGINS: "não-é-url" }).success, false);
  assert.equal(environmentSchema.safeParse({ ...base, NODE_ENV: "production", APP_URL: "http://localhost:8080" }).success, false);
});

test("eventos de chat rejeitam IDs inválidos e payload incompleto", () => {
  const id = "123e4567-e89b-12d3-a456-426614174000";
  assert.equal(conversationEventSchema.safeParse({ conversation_id: "abc" }).success, false);
  assert.equal(sendMessageEventSchema.safeParse({ conversation_id: id, content: "oi", attachment_id: null }).success, false);
  assert.equal(sendMessageEventSchema.safeParse({ conversation_id: id, content: "oi", attachment_id: null, client_message_id: id }).success, true);
});

test("suporte e endereço validam tipos sem perder aliases existentes", () => {
  assert.equal(helpBodySchema.safeParse({ assunto: "", mensagem: "Texto" }).success, false);
  assert.equal(reportBodySchema.safeParse({ motivo: "Outro", mensagem: "Texto", aluguelId: "invalid" }).success, false);
  assert.equal(addressPatchSchema.safeParse({ principal: "false", latitude: -23.5, longitude: -46.6 }).success, true);
  assert.equal(addressPatchSchema.safeParse({ cep: 12 }).success, false);
});
