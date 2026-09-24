import type { Prisma } from "../../generated/prisma/client.ts";

export const NOTIFICATION_PREFERENCE_DEFAULTS = Object.freeze({
  solicitacao_recebida: true,
  solicitacao_respondida: true,
  lembretes_aluguel: true,
  avaliacao_recebida: true,
  mensagens: true,
  novidades: false,
});

export type NotificationPreference = keyof typeof NOTIFICATION_PREFERENCE_DEFAULTS;
export type NotificationPreferences = Record<NotificationPreference, boolean>;

const preferenceByType: Readonly<Record<string, NotificationPreference>> = Object.freeze({
  solicitacao: "solicitacao_recebida",
  solicitacao_aluguel: "solicitacao_recebida",
  aluguel_aprovado: "solicitacao_respondida",
  aluguel_rejeitado: "solicitacao_respondida",
  lembrete: "lembretes_aluguel",
  avaliacao: "avaliacao_recebida",
  avaliacao_recebida: "avaliacao_recebida",
  mensagem: "mensagens",
  novidades: "novidades",
});

type NotificationDatabase = Prisma.TransactionClient;
export type NotificationInput = Prisma.notificacoesUncheckedCreateInput;

export function notificationPreferenceForType(type: string | null | undefined): NotificationPreference | null {
  return type ? preferenceByType[type] ?? null : null;
}

export function normalizeNotificationPreferences(value: unknown): NotificationPreferences {
  const stored = value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
  return Object.fromEntries(
    Object.entries(NOTIFICATION_PREFERENCE_DEFAULTS).map(([key, fallback]) => [
      key,
      typeof stored[key] === "boolean" ? stored[key] : fallback,
    ]),
  ) as NotificationPreferences;
}

export async function getNotificationPreferences(
  db: NotificationDatabase,
  userId: string,
): Promise<NotificationPreferences> {
  const user = await db.usuarios.findUniqueOrThrow({
    where: { id: userId },
    select: { preferencias: true },
  });
  return normalizeNotificationPreferences(user.preferencias);
}

export function validateNotificationPreferencesPatch(value: unknown): Partial<NotificationPreferences> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new TypeError("Preferências devem ser um objeto");
  }
  const allowed = new Set(Object.keys(NOTIFICATION_PREFERENCE_DEFAULTS));
  const result: Partial<NotificationPreferences> = {};
  for (const [key, fieldValue] of Object.entries(value)) {
    if (!allowed.has(key)) throw new TypeError(`Preferência desconhecida: ${key}`);
    if (typeof fieldValue !== "boolean") throw new TypeError(`${key} deve ser booleano`);
    result[key as NotificationPreference] = fieldValue;
  }
  return result;
}

export async function createNotification(
  db: NotificationDatabase,
  data: NotificationInput,
) {
  const preference = notificationPreferenceForType(data.tipo);
  if (preference) {
    const preferences = await getNotificationPreferences(db, data.usuario_id);
    if (!preferences[preference]) return null;
  }
  return db.notificacoes.create({ data });
}

export async function createNotifications(
  db: NotificationDatabase,
  data: NotificationInput[],
  skipDuplicates = false,
) {
  if (!data.length) return { count: 0 };
  const configurable = data.filter((entry) => notificationPreferenceForType(entry.tipo));
  const users = configurable.length
    ? await db.usuarios.findMany({
        where: { id: { in: [...new Set(configurable.map((entry) => entry.usuario_id))] } },
        select: { id: true, preferencias: true },
      })
    : [];
  const byUser = new Map(users.map((user) => [user.id, normalizeNotificationPreferences(user.preferencias)]));
  const filtered = data.filter((entry) => {
    const preference = notificationPreferenceForType(entry.tipo);
    return !preference || (byUser.get(entry.usuario_id) ?? NOTIFICATION_PREFERENCE_DEFAULTS)[preference];
  });
  if (!filtered.length) return { count: 0 };
  return db.notificacoes.createMany({ data: filtered, skipDuplicates });
}
