import assert from "node:assert/strict";
import test from "node:test";
import crypto from "node:crypto";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { mkdtemp, readFile, rm, unlink, writeFile, stat } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import type { AddressInfo } from "node:net";
import jwt from "jsonwebtoken";

const database = process.env.TEST_DATABASE_URL;
if (!database || !new URL(database).pathname.startsWith("/vizin_contract_test_")) throw new Error("Use TEST_DATABASE_URL isolado vizin_contract_test_*");
process.env.DATABASE_URL = database;
process.env.VIZIN_NO_LISTEN = "true";
process.env.NODE_ENV = "test";
process.env.PAYMENT_MODE = "demo";
process.env.JWT_KEY = "vizin-chat-presence-test-secret-32-characters";
process.env.CHAT_ATTACHMENT_MAX_MB = "50";
const require = createRequire(import.meta.url);
const ioClient = require(fileURLToPath(new URL("../../../../node_modules/socket.io/client-dist/socket.io.js", import.meta.url))) as (url: string, options: Record<string, unknown>) => any;

function waitFor(socket: any, event: string, check: (value: any) => boolean = () => true): Promise<any> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => { socket.off(event, onEvent); reject(new Error(`Timeout: ${event}`)); }, 5000);
    function onEvent(value: any) { if (!check(value)) return; clearTimeout(timer); socket.off(event, onEvent); resolve(value); }
    socket.on(event, onEvent);
  });
}

function validCpf(): string {
  let value = String(crypto.randomInt(100000000, 999999999));
  for (const size of [9, 10]) {
    const sum = [...value].reduce((total, digit, index) => total + Number(digit) * (size + 1 - index), 0);
    value += String((sum * 10 % 11) % 10);
  }
  return value;
}

test("presença Socket.IO e vídeos privados com PostgreSQL real", async t => {
  const { server, io } = await import("../../app.ts");
  const { default: prisma } = await import("../../app/config/database.ts");
  const { privateRoot } = await import("../../app/middlewares/privateUpload.ts");
  const fixtureDir = await mkdtemp(path.join(os.tmpdir(), "vizin-chat-"));
  const sockets: any[] = [];
  let ids: string[] = [];
  t.after(async () => {
    sockets.forEach(s => s.disconnect());
    const rows = ids.length ? await prisma.anexos.findMany({ where: { usuario_id: { in: ids } }, select: { caminho: true } }) : [];
    await Promise.all(rows.map(row => unlink(path.join(privateRoot, row.caminho)).catch(() => undefined)));
    await new Promise<void>(resolve => io.close(() => resolve()));
    await prisma.$disconnect();
    await rm(fixtureDir, { recursive: true, force: true });
  });
  server.listen(0, "127.0.0.1");
  await new Promise<void>(resolve => server.once("listening", resolve));
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  const user = async (name: string) => prisma.usuarios.create({ data: {
    nome: name, email: `${crypto.randomUUID()}@test.local`, cpf: validCpf(), senha_hash: "test", ativo: true,
  } });
  const [a, b, c] = await Promise.all([user("A"), user("B"), user("C")]);
  ids = [a.id, b.id, c.id];
  const conversation = await prisma.conversas.create({ data: {
    chave: `test:${crypto.randomUUID()}`, participantes: { create: [{ usuario_id: a.id }, { usuario_id: b.id }] },
  } });
  const token = (u: typeof a) => jwt.sign({ id: u.id, email: u.email, tipo: u.tipo, tokenVersion: u.token_version }, process.env.JWT_KEY!, { expiresIn: "5m" });
  const request = async (url: string, who?: typeof a, init: RequestInit = {}) => fetch(base + url, {
    ...init, headers: { ...(who ? { Authorization: `Bearer ${token(who)}` } : {}), ...(init.headers ?? {}) },
  });
  const connect = async (who: typeof a) => {
    const socket = ioClient(base, { auth: { token: token(who) }, transports: ["websocket"], reconnection: false });
    sockets.push(socket);
    await waitFor(socket, "connect");
    return socket;
  };

  await t.test("múltiplas abas, DTO, destinatários, reconexão e spoofing", async () => {
    const bSocket = await connect(b);
    const cSocket = await connect(c);
    const cEvents: any[] = []; cSocket.on("presence:update", (event: any) => cEvents.push(event));
    const onlineEvent = waitFor(bSocket, "presence:update", value => value.user_id === a.id && value.online === true);
    const a1 = await connect(a);
    assert.deepEqual(await onlineEvent, { user_id: a.id, online: true });
    let rows = await (await request("/api/conversations", b)).json() as any[];
    assert.equal(rows.find(row => row.id === conversation.id)?.user.online, true);
    const events: any[] = []; bSocket.on("presence:update", (event: any) => events.push(event));
    const a2 = await connect(a);
    a1.disconnect();
    await new Promise(resolve => setTimeout(resolve, 900));
    rows = await (await request("/api/conversations", b)).json() as any[];
    assert.equal(rows[0]?.user.online, true);
    assert.equal(events.length, 0);
    const offlineEvent = waitFor(bSocket, "presence:update", value => value.user_id === a.id && value.online === false);
    a2.disconnect();
    assert.deepEqual(await offlineEvent, { user_id: a.id, online: false });
    rows = await (await request("/api/conversations", b)).json() as any[];
    assert.equal(rows[0]?.user.online, false);
    const backEvent = waitFor(bSocket, "presence:update", value => value.user_id === a.id && value.online === true);
    const a3 = await connect(a);
    await backEvent;
    assert.equal(cEvents.length, 0);
    bSocket.emit("presence:update", { user_id: c.id, online: true });
    await new Promise(resolve => setTimeout(resolve, 100));
    assert.equal(cEvents.length, 0);
    assert.equal((await (await request("/api/conversations", b)).json() as any[])[0]?.user.online, true);
    const lastOffline = waitFor(bSocket, "presence:update", value => value.user_id === a.id && value.online === false);
    a3.disconnect();
    await lastOffline;

    await prisma.bloqueios.create({ data: { usuario_id: b.id, bloqueado_id: a.id } });
    const beforeBlocked = events.length;
    const blockedSocket = await connect(a);
    await new Promise(resolve => setTimeout(resolve, 150));
    assert.equal(events.length, beforeBlocked);
    assert.deepEqual(await (await request("/api/conversations", b)).json(), []);
    blockedSocket.disconnect();
    await prisma.bloqueios.delete({ where: { usuario_id_bloqueado_id: { usuario_id: b.id, bloqueado_id: a.id } } });

    const expiringToken = jwt.sign({ id: a.id, email: a.email, tipo: a.tipo, tokenVersion: a.token_version }, process.env.JWT_KEY!, { expiresIn: "1s" });
    const shortSocket = ioClient(base, { auth: { token: expiringToken }, transports: ["websocket"], reconnection: false });
    sockets.push(shortSocket);
    const expiredOnline = waitFor(bSocket, "presence:update", value => value.user_id === a.id && value.online === true);
    await waitFor(shortSocket, "connect");
    await expiredOnline;
    const expiredOffline = waitFor(bSocket, "presence:update", value => value.user_id === a.id && value.online === false);
    await waitFor(shortSocket, "disconnect");
    await expiredOffline;
  });

  await t.test("socket sem token ou com token inválido não registra presença", async () => {
    for (const auth of [{}, { token: "invalid" }]) {
      const socket = ioClient(base, { auth, transports: ["websocket"], reconnection: false });
      sockets.push(socket);
      await waitFor(socket, "connect_error");
      assert.equal((await (await request("/api/conversations", b)).json() as any[])[0]?.user.online, false);
      socket.disconnect();
    }
  });

  await t.test("uploads, erros, DTO, download privado e Range", async () => {
    const makeVideo = (ext: string, codec: string) => {
      const target = path.join(fixtureDir, `valid.${ext}`);
      execFileSync("ffmpeg", ["-y", "-loglevel", "error", "-f", "lavfi", "-i", "color=c=black:s=16x16:d=0.3", "-frames:v", "3", "-c:v", codec, target]);
      return target;
    };
    const files = [makeVideo("mp4", "mpeg4"), makeVideo("webm", "libvpx"), makeVideo("mov", "mpeg4")];
    const upload = async (bytes: Uint8Array, mime: string, name: string, who: typeof a | null = a) => {
      const form = new FormData(); form.append("file", new Blob([new Uint8Array(bytes)], { type: mime }), name);
      return request("/api/uploads", who ?? undefined, { method: "POST", body: form });
    };
    assert.equal((await upload(await readFile(files[0]!), "video/mp4", "valid.mp4", null)).status, 401);
    assert.equal((await request("/api/uploads", a, { method: "POST", body: new FormData() })).status, 422);
    assert.equal((await upload(new Uint8Array(), "video/mp4", "empty.mp4")).status, 422);
    let response = await upload(Buffer.from("bad"), "video/mp4", "fake.mp4");
    assert.equal(response.status, 422); assert.equal((await response.json() as any).codigo, "arquivo_invalido");
    response = await upload(Buffer.from("bad"), "text/plain", "bad.txt");
    assert.equal(response.status, 415); assert.equal((await response.json() as any).codigo, "tipo_nao_permitido");
    assert.equal((await upload(await readFile(files[0]!), "video/mp4", "wrong.webm")).status, 415);
    assert.equal((await upload(await readFile(files[0]!), "video/quicktime", "disguised.mov")).status, 422);
    assert.equal((await upload(await readFile(files[2]!), "video/mp4", "disguised.mp4")).status, 422);
    const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+ip1sAAAAASUVORK5CYII=", "base64");
    const image = await upload(png, "image/png", "photo.png");
    assert.equal(image.status, 201);
    const pdf = await upload(await readFile(new URL("../fixtures/valid.pdf", import.meta.url)), "application/pdf", "file.pdf");
    assert.equal(pdf.status, 201);
    for (const [file, mime] of files.map((value, index) => [value, ["video/mp4", "video/webm", "video/quicktime"][index]!] as const)) {
      const result = await upload(await readFile(file), mime, path.basename(file));
      assert.equal(result.status, 201, await result.clone().text().catch(() => ""));
      const data = await result.json() as any;
      assert.equal(data.type, "video"); assert.equal(data.mimeType, mime); assert.equal(data.url, `/api/uploads/${data.id}`);
      const message = await request(`/api/conversations/${conversation.id}/messages`, a, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ attachmentId: data.id }),
      });
      assert.equal(message.status, 201); assert.equal((await message.json() as any).type, "video");
      const ownDownload = await request(data.url, a); assert.equal(ownDownload.status, 200); await ownDownload.arrayBuffer();
      const partnerDownload = await request(data.url, b); assert.equal(partnerDownload.status, 200); await partnerDownload.arrayBuffer();
      assert.equal((await request(data.url, c)).status, 403);
      const ranged = await request(data.url, b, { headers: { Range: "bytes=0-9" } });
      assert.equal(ranged.status, 206); assert.equal((await ranged.arrayBuffer()).byteLength, 10);
      assert.equal(ranged.headers.get("content-type"), mime);
      assert.equal((await request(data.url, b, { headers: { Range: "bytes=999999999-" } })).status, 416);
    }
    const missing = await prisma.anexos.create({ data: { usuario_id: a.id, caminho: `${crypto.randomUUID()}.mp4`, nome: "missing.mp4", mime: "video/mp4", tamanho: 10 } });
    assert.equal((await request(`/api/uploads/${missing.id}`, a)).status, 404);
    const big = Buffer.alloc(50 * 1024 * 1024 + 1);
    const large = await upload(big, "video/mp4", "large.mp4");
    assert.equal(large.status, 413); assert.equal((await large.json() as any).codigo, "arquivo_muito_grande");
  });

  await t.test("anexo órfão antigo é removido sem tocar mensagens", async () => {
    const { pruneUnattachedChatUploads } = await import("../../app/services/chatAttachmentMaintenance.ts");
    const fileName = `${crypto.randomUUID()}.mp4`;
    const filePath = path.join(privateRoot, fileName);
    await writeFile(filePath, "orphan");
    const old = await prisma.anexos.create({ data: {
      usuario_id: a.id, caminho: fileName, nome: "orphan.mp4", mime: "video/mp4", tamanho: 6,
      criado_em: new Date(Date.now() - 25 * 60 * 60 * 1000),
    } });
    await pruneUnattachedChatUploads();
    assert.equal(await prisma.anexos.findUnique({ where: { id: old.id } }), null);
    await assert.rejects(stat(filePath), { code: "ENOENT" });
    assert.ok(await prisma.mensagens.count({ where: { conversa_id: conversation.id } }) >= 3);
  });
});
