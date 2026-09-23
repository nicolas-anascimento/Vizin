/*
  Warnings:

  - A unique constraint covering the columns `[aluguel_id,tipo]` on the table `pagamentos` will be added. If there are existing duplicate values, this will fail.

*/
-- DropForeignKey
ALTER TABLE "admin_auditoria" DROP CONSTRAINT "admin_auditoria_admin_id_fkey";

-- DropForeignKey
ALTER TABLE "cartoes" DROP CONSTRAINT "cartoes_usuario_id_fkey";

-- DropForeignKey
ALTER TABLE "conciliacoes_pagamento" DROP CONSTRAINT "conciliacoes_pagamento_admin_responsavel_id_fkey";

-- DropForeignKey
ALTER TABLE "conciliacoes_pagamento" DROP CONSTRAINT "conciliacoes_pagamento_pagamento_id_fkey";

-- DropForeignKey
ALTER TABLE "multas_aluguel" DROP CONSTRAINT "multas_aluguel_aluguel_id_fkey";

-- DropForeignKey
ALTER TABLE "operacoes_pagamento" DROP CONSTRAINT "operacoes_pagamento_pagamento_id_fkey";

-- DropIndex
DROP INDEX "pagamentos_uma_cobranca_ativa";

-- AlterTable
ALTER TABLE "admin_auditoria" ALTER COLUMN "id" DROP DEFAULT;

-- AlterTable
ALTER TABLE "multas_aluguel" ALTER COLUMN "atualizado_em" DROP DEFAULT;

-- CreateIndex
CREATE UNIQUE INDEX "pagamentos_uma_cobranca_ativa" ON "pagamentos"("aluguel_id", "tipo") WHERE (status IN ('pendente','pago','cancelamento_pendente','estorno_pendente'));

-- AddForeignKey
ALTER TABLE "multas_aluguel" ADD CONSTRAINT "multas_aluguel_aluguel_id_fkey" FOREIGN KEY ("aluguel_id") REFERENCES "alugueis"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "conciliacoes_pagamento" ADD CONSTRAINT "conciliacoes_pagamento_pagamento_id_fkey" FOREIGN KEY ("pagamento_id") REFERENCES "pagamentos"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cartoes" ADD CONSTRAINT "cartoes_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "usuarios"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "operacoes_pagamento" ADD CONSTRAINT "operacoes_pagamento_pagamento_id_fkey" FOREIGN KEY ("pagamento_id") REFERENCES "pagamentos"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "admin_auditoria" ADD CONSTRAINT "admin_auditoria_admin_id_fkey" FOREIGN KEY ("admin_id") REFERENCES "usuarios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- RenameIndex
ALTER INDEX "webhook_eventos_processado_em_proxima_tentativa_em_lease_ate_id" RENAME TO "webhook_eventos_processado_em_proxima_tentativa_em_lease_at_idx";
