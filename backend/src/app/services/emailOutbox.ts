import { createHash } from "node:crypto";
import prisma from "../config/database.ts";
import mailer from "../config/mailer.ts";
import env from "../config/env.ts";

const BATCH_SIZE = 20;
const LEASE_MS = 120_000;
let workerEnabled = false;
let running = false;
let requested = false;
let scheduled: NodeJS.Immediate | null = null;

function metric(event: string, fields: Record<string, string | number | null>): void {
  // Nunca inclua destinatário, conteúdo, chave de deduplicação ou token.
  console.info(JSON.stringify({ component: "email_outbox", event, ...fields }));
}

async function tokenIsActive(row: { tipo: string; chave: string; payload: unknown; destinatario: string }): Promise<boolean> {
  if (row.tipo === "verificacao_email") {
    const hash = row.chave.split(":").at(-1) ?? "";
    return Boolean(await prisma.tokens_verificacao_email.findFirst({ where: { token_hash: hash, expira_em: { gt: new Date() } } }));
  }
  if (row.tipo === "recuperacao_senha") {
    const hash = row.chave.split(":").at(-1) ?? "";
    return Boolean(await prisma.resetar_Senha.findFirst({ where: { token: hash, expire_in: { gt: new Date() } } }));
  }
  if (row.tipo === "troca_email") {
    // Também cobre mensagens antigas cuja chave não continha o hash do token.
    const payload = row.payload as Record<string, unknown>;
    const match = typeof payload.text === "string" ? payload.text.match(/[?&]token=([a-f0-9]{64})(?:\b|$)/) : null;
    if (!match) return false;
    const hash = createHash("sha256").update(match[1]!).digest("hex");
    return Boolean(await prisma.emails_pendentes.findFirst({ where: { token: hash, email: row.destinatario, expira_em: { gt: new Date() } } }));
  }
  return true;
}

// Claim condicional no PostgreSQL: processos diferentes podem ler a mesma linha,
// mas somente um consegue adquirir o lease antes de falar com o SMTP.
export async function processEmailOutbox(): Promise<number> {
  const now = new Date();
  const due = { status: "pendente", AND: [
    { OR: [{ proxima_em: null }, { proxima_em: { lte: now } }] },
    { OR: [{ lease_ate: null }, { lease_ate: { lt: now } }] },
  ] };
  const rows = await prisma.email_outbox.findMany({ where: due, orderBy: { criado_em: "asc" }, take: BATCH_SIZE });
  let claimedCount = 0;
  for (const row of rows) {
    const startedAt = new Date();
    const claimed = await prisma.email_outbox.updateMany({
      where: { id: row.id, ...due },
      data: { lease_ate: new Date(Date.now() + LEASE_MS), tentativas: { increment: 1 } },
    });
    if (!claimed.count) continue;
    claimedCount++;
    const fields = { id: row.id, tipo: row.tipo, tentativa: row.tentativas + 1 };
    metric("processing_started", { ...fields, queued_at: row.criado_em.toISOString(), started_at: startedAt.toISOString(), queue_wait_ms: startedAt.getTime() - row.criado_em.getTime() });
    try {
      if (!await tokenIsActive(row)) {
        await prisma.email_outbox.update({ where: { id: row.id }, data: { status: "cancelado", payload: {}, lease_ate: null } });
        metric("cancelled_expired_token", fields);
        continue;
      }
      if (!mailer) {
        await prisma.email_outbox.update({ where: { id: row.id }, data: { lease_ate: null, proxima_em: new Date(Date.now() + 15 * 60_000), ultimo_erro: "SMTP_NOT_CONFIGURED" } });
        metric("processing_error", { ...fields, error_at: new Date().toISOString(), error_code: "SMTP_NOT_CONFIGURED" });
        continue;
      }
      const payload = row.payload as Record<string, unknown>;
      const smtpStart = Date.now();
      const result = await mailer.sendMail({ from: env.SMTP_FROM, to: row.destinatario, subject: String(payload.subject ?? "VIZIN"), text: String(payload.text ?? "") });
      if (!result.accepted.length) throw Object.assign(new Error("SMTP não aceitou o destinatário"), { code: "SMTP_REJECTED" });
      // sendMail resolvido significa aceitação pelo SMTP, não entrega na caixa do destinatário.
      const acceptedAt = new Date();
      await prisma.email_outbox.update({ where: { id: row.id }, data: { status: "enviado", enviado_em: acceptedAt, lease_ate: null, ultimo_erro: null, payload: { subject: String(payload.subject ?? "VIZIN") } } });
      metric("smtp_accepted", { ...fields, accepted_at: acceptedAt.toISOString(), queue_to_smtp_ms: acceptedAt.getTime() - row.criado_em.getTime(), smtp_duration_ms: acceptedAt.getTime() - smtpStart, accepted_count: result.accepted.length, rejected_count: result.rejected.length });
    } catch (error) {
      const code = typeof error === "object" && error !== null && "code" in error ? String(error.code).slice(0, 40) : "SMTP_ERROR";
      await prisma.email_outbox.update({ where: { id: row.id }, data: { lease_ate: null, proxima_em: new Date(Date.now() + Math.min(3_600_000, 60_000 * 2 ** Math.min(row.tentativas, 6))), ultimo_erro: code } });
      metric("processing_error", { ...fields, error_at: new Date().toISOString(), error_code: code });
    }
  }
  return claimedCount;
}

async function drain(): Promise<void> {
  if (running || !workerEnabled) return;
  running = true;
  try {
    do {
      requested = false;
      const count = await processEmailOutbox();
      if (count === BATCH_SIZE) requested = true;
    } while (requested && workerEnabled);
  } catch (error) {
    // O intervalo periódico retomará o processamento mesmo após erro de banco.
    const code = typeof error === "object" && error !== null && "code" in error ? String(error.code).slice(0, 40) : "WORKER_ERROR";
    metric("worker_error", { error_at: new Date().toISOString(), error_code: code });
  } finally {
    running = false;
    if (requested && workerEnabled) wakeEmailOutbox();
  }
}

// Chamar somente após o await da transação que gravou a mensagem.
export function wakeEmailOutbox(): void {
  if (!workerEnabled) return;
  requested = true;
  if (running || scheduled) return;
  scheduled = setImmediate(() => {
    scheduled = null;
    void drain();
  });
}

export function startEmailOutboxWorker(): () => void {
  workerEnabled = true;
  wakeEmailOutbox(); // Recupera pendências logo após reinício.
  return () => {
    workerEnabled = false;
    if (scheduled) clearImmediate(scheduled);
    scheduled = null;
  };
}
