import assert from "node:assert/strict";
import test from "node:test";
import type { Request } from "express";
import { getTrustedClientIp } from "../app/utils/clientIdentity.ts";
import {
  consumeRateLimit,
  getLoginAccountRateLimitKey,
  getRateLimitKey,
  resetRateLimitBucketsForTests,
} from "../app/middlewares/rateLimit.ts";

const uuidA = "11111111-1111-4111-8111-111111111111";
const uuidB = "22222222-2222-4222-8222-222222222222";

function request(options: {
  remote?: string;
  trusted?: boolean;
  ip?: string;
  cf?: string;
  xff?: string;
  userId?: string;
  cpf?: string;
} = {}): Request {
  const remote = options.remote ?? "127.0.0.1";
  return {
    socket: { remoteAddress: remote },
    ip: options.ip ?? remote,
    ips: options.xff ? [options.ip ?? options.xff] : [],
    headers: {
      ...(options.cf ? { "cf-connecting-ip": options.cf } : {}),
      ...(options.xff ? { "x-forwarded-for": options.xff } : {}),
    },
    app: { get: () => ((_address: string, hop: number) => Boolean(options.trusted) && hop === 0) },
    body: options.cpf ? { cpf: options.cpf } : {},
    ...(options.userId ? { user: { id: options.userId, email: "user@example.test", tipo: "usuario" } } : {}),
  } as unknown as Request;
}

test("IPs anônimos diferentes recebem buckets independentes", () => {
  resetRateLimitBucketsForTests();
  const keyA = getRateLimitKey(request({ remote: "198.51.100.10" }), "ip");
  const keyB = getRateLimitKey(request({ remote: "198.51.100.11" }), "ip");
  assert.notEqual(keyA, keyB);
  assert.equal(consumeRateLimit(`public:${keyA}`, 60_000, 1).allowed, true);
  assert.equal(consumeRateLimit(`public:${keyA}`, 60_000, 1).allowed, false);
  assert.equal(consumeRateLimit(`public:${keyB}`, 60_000, 1).allowed, true);
});

test("usuários autenticados diferentes não compartilham o bucket", () => {
  resetRateLimitBucketsForTests();
  const keyA = getRateLimitKey(request({ userId: uuidA }));
  const keyB = getRateLimitKey(request({ userId: uuidB }));
  assert.equal(keyA, `user:${uuidA}`);
  assert.equal(keyB, `user:${uuidB}`);
  assert.equal(consumeRateLimit(`upload:${keyA}`, 60_000, 1).allowed, true);
  assert.equal(consumeRateLimit(`upload:${keyA}`, 60_000, 1).allowed, false);
  assert.equal(consumeRateLimit(`upload:${keyB}`, 60_000, 1).allowed, true);
});

test("o mesmo usuário compartilha bucket entre sessões", () => {
  resetRateLimitBucketsForTests();
  const firstSession = getRateLimitKey(request({ remote: "198.51.100.10", userId: uuidA }));
  const secondSession = getRateLimitKey(request({ remote: "198.51.100.11", userId: uuidA }));
  assert.equal(firstSession, secondSession);
  assert.equal(consumeRateLimit(`admin-write:${firstSession}`, 60_000, 1).allowed, true);
  assert.equal(consumeRateLimit(`admin-write:${secondSession}`, 60_000, 1).allowed, false);
});

test("headers forjados são ignorados sem peer confiável", () => {
  const req = request({
    remote: "198.51.100.20",
    trusted: false,
    ip: "203.0.113.77",
    cf: "203.0.113.88",
    xff: "203.0.113.99",
  });
  assert.equal(getTrustedClientIp(req), "198.51.100.20");
  assert.equal(getRateLimitKey(req, "ip"), "ip:198.51.100.20");
});

test("cloudflared confiável fornece CF-Connecting-IP e separa três clientes", () => {
  const keys = ["198.51.100.31", "198.51.100.32", "198.51.100.33"].map((cf) =>
    getRateLimitKey(request({ remote: "127.0.0.1", trusted: true, cf, xff: cf, ip: cf }), "ip"),
  );
  assert.deepEqual(keys, ["ip:198.51.100.31", "ip:198.51.100.32", "ip:198.51.100.33"]);
  assert.equal(new Set(keys).size, 3);
});

test("proxy confiável usa req.ip quando CF-Connecting-IP não está presente", () => {
  const req = request({ remote: "127.0.0.1", trusted: true, ip: "198.51.100.40", xff: "198.51.100.40" });
  assert.equal(getTrustedClientIp(req), "198.51.100.40");
});

test("login combina IP com hash estável da conta sem armazenar CPF", () => {
  const first = getLoginAccountRateLimitKey(request({ cpf: "529.982.247-25" }));
  const second = getLoginAccountRateLimitKey(request({ cpf: "52998224725" }));
  assert.equal(first, second);
  assert.match(first!, /^account:[a-f0-9]{64}$/);
  assert.equal(first!.includes("52998224725"), false);
});

test("admin autenticado usa UUID, não IP do tunnel", () => {
  const key = getRateLimitKey(request({ remote: "127.0.0.1", trusted: true, cf: "198.51.100.50", userId: uuidA }));
  assert.equal(key, `user:${uuidA}`);
});

test("Socket.IO compartilha mensagens do mesmo usuário e separa usuários", () => {
  resetRateLimitBucketsForTests();
  const socketA1 = `chat-message:user:${uuidA}`;
  const socketA2 = `chat-message:user:${uuidA}`;
  const socketB = `chat-message:user:${uuidB}`;
  assert.equal(consumeRateLimit(socketA1, 60_000, 1).allowed, true);
  assert.equal(consumeRateLimit(socketA2, 60_000, 1).allowed, false);
  assert.equal(consumeRateLimit(socketB, 60_000, 1).allowed, true);
});
