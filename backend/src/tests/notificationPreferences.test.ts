import assert from "node:assert/strict";
import test from "node:test";
import crypto from "node:crypto";
import type { Prisma } from "../generated/prisma/client.ts";
import {
  createNotification,
  createNotifications,
  normalizeNotificationPreferences,
  notificationPreferenceForType,
  validateNotificationPreferencesPatch,
} from "../app/services/notificationPreferences.ts";

const userA = "11111111-1111-4111-8111-111111111111";
const userB = "22222222-2222-4222-8222-222222222222";

function database(preferences: Record<string, Record<string, boolean>>) {
  const created: Array<Record<string, unknown>> = [];
  const db = {
    usuarios: {
      findUniqueOrThrow: async ({ where }: any) => ({ preferencias: preferences[where.id] ?? {} }),
      findMany: async ({ where }: any) => where.id.in.map((id: string) => ({ id, preferencias: preferences[id] ?? {} })),
    },
    notificacoes: {
      create: async ({ data }: any) => { created.push(data); return { id: crypto.randomUUID(), ...data }; },
      createMany: async ({ data }: any) => { created.push(...data); return { count: data.length }; },
    },
  } as unknown as Prisma.TransactionClient;
  return { db, created };
}

test("defaults de notificação são definidos pelo backend para usuário existente", () => {
  assert.deepEqual(normalizeNotificationPreferences({}), {
    solicitacao_recebida: true,
    solicitacao_respondida: true,
    lembretes_aluguel: true,
    avaliacao_recebida: true,
    mensagens: true,
    novidades: false,
  });
});

test("update parcial aceita apenas campos conhecidos e booleanos reais", () => {
  assert.deepEqual(validateNotificationPreferencesPatch({ mensagens: false }), { mensagens: false });
  assert.throws(() => validateNotificationPreferencesPatch({ mensagens: "sim" }), /booleano/);
  assert.throws(() => validateNotificationPreferencesPatch({ desconhecida: true }), /desconhecida/);
  assert.throws(() => validateNotificationPreferencesPatch(null), /objeto/);
});

test("categorias configuráveis têm política explícita", () => {
  assert.equal(notificationPreferenceForType("solicitacao"), "solicitacao_recebida");
  assert.equal(notificationPreferenceForType("aluguel_aprovado"), "solicitacao_respondida");
  assert.equal(notificationPreferenceForType("aluguel_rejeitado"), "solicitacao_respondida");
  assert.equal(notificationPreferenceForType("lembrete"), "lembretes_aluguel");
  assert.equal(notificationPreferenceForType("avaliacao"), "avaliacao_recebida");
  assert.equal(notificationPreferenceForType("mensagem"), "mensagens");
  assert.equal(notificationPreferenceForType("novidades"), "novidades");
});

test("preferência desabilitada suprime somente a notificação opcional", async () => {
  const { db, created } = database({ [userA]: {
    solicitacao_recebida: false,
    solicitacao_respondida: false,
    lembretes_aluguel: false,
    avaliacao_recebida: false,
    mensagens: false,
    novidades: false,
  } });
  for (const tipo of ["solicitacao", "aluguel_aprovado", "aluguel_rejeitado", "lembrete", "avaliacao", "mensagem", "novidades"]) {
    assert.equal(await createNotification(db, { usuario_id: userA, tipo, titulo: tipo }), null);
  }
  assert.equal(created.length, 0);
});

test("preferência habilitada cria a notificação opcional", async () => {
  const { db, created } = database({ [userA]: { mensagens: true } });
  await createNotification(db, { usuario_id: userA, tipo: "mensagem", titulo: "Mensagem" });
  assert.equal(created.length, 1);
});

test("lote respeita preferências separadas de cada destinatário", async () => {
  const { db, created } = database({ [userA]: { lembretes_aluguel: false }, [userB]: { lembretes_aluguel: true } });
  await createNotifications(db, [userA, userB].map((usuario_id) => ({ usuario_id, tipo: "lembrete", titulo: "Retirada" })));
  assert.deepEqual(created.map((entry) => entry.usuario_id), [userB]);
});

test("pagamento, multa, retirada, devolução, suporte e segurança são obrigatórios", async () => {
  const disabled = Object.fromEntries([
    "solicitacao_recebida", "solicitacao_respondida", "lembretes_aluguel",
    "avaliacao_recebida", "mensagens", "novidades",
  ].map((key) => [key, false]));
  const { db, created } = database({ [userA]: disabled });
  const mandatory = ["pagamento", "multa_paga", "multa_contestada", "retirada", "retirada_atrasada", "devolucao", "suporte", "bloqueio_conta"];
  for (const tipo of mandatory) {
    assert.equal(notificationPreferenceForType(tipo), null);
    await createNotification(db, { usuario_id: userA, tipo, titulo: tipo });
  }
  assert.equal(created.length, mandatory.length);
});
