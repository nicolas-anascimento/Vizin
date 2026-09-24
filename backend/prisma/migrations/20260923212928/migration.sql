/*
  Warnings:

  - A unique constraint covering the columns `[aluguel_id,tipo]` on the table `pagamentos` will be added. If there are existing duplicate values, this will fail.

*/
-- DropIndex
DROP INDEX "pagamentos_uma_cobranca_ativa";

-- CreateIndex
CREATE UNIQUE INDEX "pagamentos_uma_cobranca_ativa" ON "pagamentos"("aluguel_id", "tipo") WHERE (status IN ('pendente','pago','cancelamento_pendente','estorno_pendente'));
