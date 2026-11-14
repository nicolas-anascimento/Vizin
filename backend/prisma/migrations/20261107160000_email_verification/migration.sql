ALTER TABLE "usuarios" ADD COLUMN "email_verificado" BOOLEAN NOT NULL DEFAULT false;
CREATE TABLE "tokens_verificacao_email" (
  "usuario_id" UUID NOT NULL PRIMARY KEY,
  "token_hash" VARCHAR(64) NOT NULL UNIQUE,
  "expira_em" TIMESTAMP(3) NOT NULL,
  "criado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "tokens_verificacao_email_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "usuarios"("id") ON DELETE CASCADE
);
