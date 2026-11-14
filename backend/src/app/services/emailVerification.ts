import { createHash, randomBytes } from "node:crypto";
import env from "../config/env.ts";

export const verificationHash = (token: string) => createHash("sha256").update(token).digest("hex");

export function verificationMessage(user: { id: string; nome: string; email: string }) {
  const token = randomBytes(32).toString("hex");
  const token_hash = verificationHash(token);
  const link = `${env.APP_URL.replace(/\/$/, "")}/confirmar-email?token=${encodeURIComponent(token)}`;
  return {
    token_hash,
    expira_em: new Date(Date.now() + 60 * 60_000),
    outbox: {
      tipo: "verificacao_email",
      destinatario: user.email,
      chave: `verificacao-email:${user.id}:${token_hash}`,
      payload: { subject: "Confirme seu e-mail no VIZIN", text: `Olá, ${user.nome}. Confirme seu e-mail pelo link abaixo (válido por 1 hora):\n${link}\nSe você não criou esta conta, ignore esta mensagem.` },
    },
  };
}
