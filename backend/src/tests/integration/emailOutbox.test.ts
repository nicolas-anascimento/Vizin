import assert from "node:assert/strict";
import test from "node:test";
import { randomInt, randomUUID } from "node:crypto";
import { spawn, type ChildProcess } from "node:child_process";
import type { AddressInfo } from "node:net";

const database = process.env.TEST_DATABASE_URL;
let isolatedDatabase = false;
try {
  if (database) {
    const url = new URL(database);
    isolatedDatabase = ["postgres:", "postgresql:"].includes(url.protocol) && url.pathname.startsWith("/vizin_contract_test_");
  }
} catch {
  // Não inclua a URL fornecida no erro: ela pode conter credenciais.
}
if (!isolatedDatabase) throw new Error("TEST_DATABASE_URL deve ser uma URL PostgreSQL de banco isolado vizin_contract_test_*");
const mailpitBinary = process.env.MAILPIT_BIN;
if (!mailpitBinary) throw new Error("MAILPIT_BIN é obrigatório");
process.env.DATABASE_URL = database;
process.env.VIZIN_NO_LISTEN = "true";
process.env.NODE_ENV = "test";
process.env.PAYMENT_MODE = "demo";
process.env.APP_URL = "http://localhost:8080";
process.env.FRONTEND_ORIGINS = "http://localhost:8080";
process.env.JWT_KEY = "vizin-test-secret-with-at-least-32-characters";
process.env.SMTP_HOST = "127.0.0.1";
process.env.SMTP_PORT = "1027";
process.env.SMTP_SECURE = "false";
process.env.SMTP_USER = "";
process.env.SMTP_PASS = "";
process.env.SMTP_FROM = "qa@vizin.test";
process.env.EMAIL_TRANSPORT = "";
process.env.PASSWORD_TRANSPORT = "";

function cpf(): string {
  let value = String(randomInt(100000000, 999999999));
  for (const n of [9, 10]) {
    const sum = [...value].reduce((total, digit, index) => total + Number(digit) * (n + 1 - index), 0);
    value += String((sum * 10 % 11) % 10);
  }
  return value;
}

async function waitFor<T>(read: () => Promise<T | null>, timeoutMs = 6000): Promise<T> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const value = await read();
    if (value !== null) return value;
    await new Promise(resolve => setTimeout(resolve, 50));
  }
  throw new Error(`Timeout após ${timeoutMs} ms`);
}

test("email_outbox: fluxos HTTP, Mailpit, retomada e concorrência", async t => {
  const { default: app } = await import("../../app.ts");
  const { default: prisma } = await import("../../app/config/database.ts");
  const { startEmailOutboxWorker, processEmailOutbox, wakeEmailOutbox } = await import("../../app/services/emailOutbox.ts");
  const { default: mailer } = await import("../../app/config/mailer.ts");
  const server = app.listen(0, "127.0.0.1");
  await new Promise<void>(resolve => server.once("listening", resolve));
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api`;
  let workerStop: (() => void) | null = null;
  let mailpit: ChildProcess | null = null;
  const inbox = `http://127.0.0.1:8027/api/v1`;
  const mailpitArgs = ["--listen", "127.0.0.1:8027", "--smtp", "127.0.0.1:1027", "--database", `/tmp/vizin-outbox-test-${process.pid}.db`, "--disable-version-check", "--quiet"];
  async function startMailpit() {
    mailpit = spawn(mailpitBinary!, mailpitArgs, { stdio: "ignore" });
    await waitFor(async () => {
      try { return (await fetch(`${inbox}/messages`)).ok ? true : null; } catch { return null; }
    });
  }
  async function stopMailpit() {
    if (!mailpit) return;
    const child = mailpit;
    mailpit = null;
    child.kill("SIGTERM");
    await new Promise<void>(resolve => child.once("exit", () => resolve()));
  }
  async function api(path: string, method = "GET", body?: unknown, token?: string) {
    const response = await fetch(base + path, { method, headers: { Origin: "http://localhost:8080", "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
    return { status: response.status, data: await response.json() as Record<string, any> };
  }
  async function mailFor(address: string, count = 1) {
    return waitFor(async () => {
      const list = await (await fetch(`${inbox}/messages?limit=100`)).json() as { messages: Array<{ ID: string; To: Array<{ Address: string }> }> };
      const matches = list.messages.filter(message => message.To.some(to => to.Address === address));
      return matches.length >= count ? matches : null;
    });
  }
  async function textFor(address: string, count = 1) {
    const matches = await mailFor(address, count);
    const response = await fetch(`${inbox}/message/${matches[0]!.ID}`);
    return (await response.json() as { Text: string }).Text;
  }
  async function sent(address: string, count = 1) {
    return waitFor(async () => {
      const rows = await prisma.email_outbox.findMany({ where: { destinatario: address, status: "enviado" }, orderBy: { criado_em: "desc" } });
      return rows.length >= count ? rows : null;
    });
  }
  async function register(label: string) {
    const user = { nome: label, cpf: cpf(), email: `${label}-${randomUUID()}@vizin.test`, senha: "senha12345" };
    assert.equal((await api("/usuarios", "POST", user)).status, 201);
    const login = await api("/login", "POST", { cpf: user.cpf, senha: user.senha });
    assert.equal(login.status, 200);
    return { ...user, token: String(login.data.token) };
  }
  t.after(async () => {
    workerStop?.();
    await stopMailpit();
    mailer?.close();
    await new Promise<void>(resolve => server.close(() => resolve()));
    await prisma.$disconnect();
  });
  await startMailpit();
  workerStop = startEmailOutboxWorker();

  const verified = await register("cadastro");
  const first = (await sent(verified.email))[0]!;
  await mailFor(verified.email);
  assert.equal(first.tentativas, 1);
  assert.ok(first.enviado_em!.getTime() - first.criado_em.getTime() < 5000);
  const verificationText = await textFor(verified.email);
  const verificationToken = verificationText.match(/confirmar-email\?token=([a-f0-9]{64})/)?.[1];
  assert.ok(verificationToken);
  assert.equal((await api("/usuarios/email/verificar", "POST", { token: verificationToken })).status, 200);
  assert.equal((await api("/usuarios/email/verificar", "POST", { token: verificationToken })).status, 400);

  const expired = await register("expirado");
  await sent(expired.email);
  const expiredToken = (await textFor(expired.email)).match(/confirmar-email\?token=([a-f0-9]{64})/)?.[1];
  assert.ok(expiredToken);
  await prisma.tokens_verificacao_email.update({
    where: { usuario_id: (await prisma.usuarios.findUniqueOrThrow({ where: { email: expired.email } })).id },
    data: { expira_em: new Date(Date.now() - 1000) },
  });
  assert.equal((await api("/usuarios/email/verificar", "POST", { token: expiredToken })).status, 400);
  assert.equal((await prisma.usuarios.findUniqueOrThrow({ where: { email: expired.email } })).email_verificado, false);

  const resend = await register("reenvio");
  await sent(resend.email);
  await prisma.tokens_verificacao_email.update({ where: { usuario_id: (await prisma.usuarios.findUniqueOrThrow({ where: { email: resend.email } })).id }, data: { criado_em: new Date(Date.now() - 120_000) } });
  assert.equal((await api("/usuarios/email/reenviar", "POST", {}, resend.token)).status, 202);
  await sent(resend.email, 2);
  assert.equal((await mailFor(resend.email, 2)).length, 2);

  const changedEmail = `alterado-${randomUUID()}@vizin.test`;
  assert.equal((await api("/usuarios/email", "PUT", { email: changedEmail, senha: verified.senha }, verified.token)).status, 202);
  await sent(changedEmail);
  const changeText = await textFor(changedEmail);
  const changeToken = changeText.match(/[?&]token=([a-f0-9]{64})/)?.[1];
  assert.ok(changeToken);
  const changeLink = new URL(changeText.match(/https?:\/\/\S+/)?.[0] ?? "");
  assert.equal(changeLink.pathname, "/api/usuarios/email/confirmar");
  const linkResponse = await fetch(`${base}/usuarios/email/confirmar?token=${changeToken}`, { redirect: "manual" });
  assert.equal(linkResponse.status, 303);
  assert.equal(linkResponse.headers.get("location"), `/confirmar-email?tipo=alteracao&token=${changeToken}`);
  assert.equal((await api("/usuarios/email/confirmar", "POST", { token: changeToken })).status, 200);
  assert.equal((await api("/usuarios/email/confirmar", "POST", { token: changeToken })).status, 400);
  assert.equal((await prisma.usuarios.findUniqueOrThrow({ where: { email: changedEmail } })).email_verificado, true);

  assert.equal((await api("/contas/recuperar-senha", "POST", { email: changedEmail })).status, 200);
  await sent(changedEmail, 2);
  const recoveryText = await textFor(changedEmail, 2);
  assert.ok(recoveryText.includes("resetar-senha"));

  workerStop(); workerStop = null;
  const pendingAddress = `restart-${randomUUID()}@vizin.test`;
  await prisma.email_outbox.create({ data: { tipo: "teste_reinicio", destinatario: pendingAddress, chave: `restart:${randomUUID()}`, payload: { subject: "Reinício", text: "Teste" } } });
  await new Promise(resolve => setTimeout(resolve, 150));
  assert.equal(await prisma.email_outbox.count({ where: { destinatario: pendingAddress, status: "pendente" } }), 1);
  workerStop = startEmailOutboxWorker();
  await sent(pendingAddress);
  assert.equal((await mailFor(pendingAddress)).length, 1);

  workerStop(); workerStop = null;
  const concurrentAddress = `concorrencia-${randomUUID()}@vizin.test`;
  await prisma.email_outbox.create({ data: { tipo: "teste_concorrencia", destinatario: concurrentAddress, chave: `concurrent:${randomUUID()}`, payload: { subject: "Concorrência", text: "Teste" } } });
  await Promise.all([processEmailOutbox(), processEmailOutbox(), processEmailOutbox()]);
  assert.equal((await sent(concurrentAddress))[0]!.tentativas, 1);
  assert.equal((await mailFor(concurrentAddress)).length, 1);
  const processAddress = `processos-${randomUUID()}@vizin.test`;
  await prisma.email_outbox.create({ data: { tipo: "teste_processos", destinatario: processAddress, chave: `processes:${randomUUID()}`, payload: { subject: "Dois processos", text: "Teste" } } });
  const workerModule = new URL("../../app/services/emailOutbox.ts", import.meta.url).href;
  const databaseModule = new URL("../../app/config/database.ts", import.meta.url).href;
  const mailerModule = new URL("../../app/config/mailer.ts", import.meta.url).href;
  const workerScript = `const {processEmailOutbox}=await import(${JSON.stringify(workerModule)}); const {default:prisma}=await import(${JSON.stringify(databaseModule)}); const {default:mailer}=await import(${JSON.stringify(mailerModule)}); await processEmailOutbox(); mailer?.close(); await prisma.$disconnect();`;
  const runProcess = () => new Promise<void>((resolve, reject) => {
    const child = spawn(process.execPath, ["--import", "tsx", "--input-type=module", "-e", workerScript], { cwd: process.cwd(), env: process.env, stdio: "ignore" });
    child.once("exit", code => code === 0 ? resolve() : reject(new Error(`Worker independente terminou com ${code}`)));
  });
  await Promise.all([runProcess(), runProcess()]);
  assert.equal((await sent(processAddress))[0]!.tentativas, 1);
  assert.equal((await mailFor(processAddress)).length, 1);
  workerStop = startEmailOutboxWorker();

  const concurrentUsers = await Promise.all(Array.from({ length: 4 }, (_, index) => register(`simultaneo${index}`)));
  for (const user of concurrentUsers) {
    assert.equal((await sent(user.email))[0]!.tentativas, 1);
    assert.equal((await mailFor(user.email)).length, 1);
  }

  await stopMailpit();
  const failedAddress = `falha-${randomUUID()}@vizin.test`;
  const failed = await prisma.email_outbox.create({ data: { tipo: "teste_falha", destinatario: failedAddress, chave: `failure:${randomUUID()}`, payload: { subject: "Falha", text: "Teste" } } });
  wakeEmailOutbox();
  await waitFor(async () => {
    const row = await prisma.email_outbox.findUniqueOrThrow({ where: { id: failed.id } });
    return row.tentativas === 1 && row.proxima_em ? row : null;
  });
  const retry = await prisma.email_outbox.findUniqueOrThrow({ where: { id: failed.id } });
  assert.equal(retry.status, "pendente");
  assert.ok(retry.proxima_em!.getTime() > Date.now());
  await startMailpit();
  await prisma.email_outbox.update({ where: { id: failed.id }, data: { proxima_em: new Date(Date.now() - 1000) } });
  wakeEmailOutbox();
  assert.equal((await sent(failedAddress))[0]!.tentativas, 2);
  assert.equal((await mailFor(failedAddress)).length, 1);

  const expiredAddress = `expirado-${randomUUID()}@vizin.test`;
  await prisma.email_outbox.create({ data: { tipo: "verificacao_email", destinatario: expiredAddress, chave: `verificacao-email:${randomUUID()}:${"a".repeat(64)}`, payload: { subject: "Expirado", text: "Teste" } } });
  wakeEmailOutbox();
  await waitFor(async () => (await prisma.email_outbox.count({ where: { destinatario: expiredAddress, status: "cancelado" } })) === 1 ? true : null);
  const finalInbox = await (await fetch(`${inbox}/messages?limit=100`)).json() as { messages: Array<{ To: Array<{ Address: string }> }> };
  assert.equal(finalInbox.messages.some(message => message.To.some(to => to.Address === expiredAddress)), false);
});
