import crypto from "node:crypto";
import prisma from "../config/database.ts";

// Ordena chaves recursivamente para que parâmetros equivalentes gerem a mesma impressão digital.
function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => [key, canonical(item)]));
  }
  return value;
}

// Cria hash estável da intenção financeira para detectar uso conflitante da chave idempotente.
export function operationFingerprint(value: unknown): string {
  return crypto.createHash("sha256").update(JSON.stringify(canonical(value))).digest("hex");
}

// Reivindica a operação no banco com lease; evita duas chamadas simultâneas ao provedor.
export async function claimGatewayOperation(chave: string, leaseMs = 60_000): Promise<boolean> {
  const now = new Date();
  const claimed = await prisma.operacoes_gateway.updateMany({
    where: { chave, OR: [{ estado: { in: ["pendente", "falhou"] } }, { estado: "processando", lease_ate: { lt: now } }] },
    data: { estado: "processando", lease_ate: new Date(now.getTime() + leaseMs), tentativas: { increment: 1 } },
  });
  return claimed.count === 1;
}

// Aplica o mesmo lease a criação, cancelamento e estorno de pagamentos.
export async function claimPaymentOperation(chave: string, leaseMs = 60_000): Promise<boolean> {
  const now = new Date();
  const claimed = await prisma.operacoes_pagamento.updateMany({
    where: { chave, OR: [{ estado: { in: ["pendente", "falhou"] } }, { estado: "processando", lease_ate: { lt: now } }] },
    data: { estado: "processando", lease_ate: new Date(now.getTime() + leaseMs), tentativas: { increment: 1 } },
  });
  return claimed.count === 1;
}

// Aguarda brevemente a operação concorrente concluir e lê seu resultado persistido.
export async function waitFor<T>(read: () => Promise<T>, done: (value: T) => boolean, timeoutMs = 16_000): Promise<T> {
  const deadline = Date.now() + timeoutMs;
  let value = await read();
  while (!done(value) && Date.now() < deadline) {
    await new Promise(resolve => setTimeout(resolve, 50));
    value = await read();
  }
  return value;
}
