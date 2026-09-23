-- O identificador criado pelo cliente correlaciona ACKs e torna reenvios
-- do Socket.IO/REST idempotentes para cada remetente.
ALTER TABLE "mensagens" ADD COLUMN "cliente_id" UUID;

CREATE UNIQUE INDEX "mensagens_remetente_cliente_key"
  ON "mensagens"("remetente_id", "cliente_id");
