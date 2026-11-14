-- DropForeignKey
ALTER TABLE "tokens_verificacao_email" DROP CONSTRAINT "tokens_verificacao_email_usuario_id_fkey";

-- AddForeignKey
ALTER TABLE "tokens_verificacao_email" ADD CONSTRAINT "tokens_verificacao_email_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "usuarios"("id") ON DELETE CASCADE ON UPDATE CASCADE;
