-- DropForeignKey
ALTER TABLE "Resetar_Senha" DROP CONSTRAINT "Resetar_Senha_userId_fkey";

-- AlterTable
ALTER TABLE "itens" ADD COLUMN     "arquivado" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "localizacao_texto" VARCHAR(200);

-- AlterTable
ALTER TABLE "usuarios" ADD COLUMN     "ativo" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "token_version" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "retiradas" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "aluguel_id" UUID NOT NULL,
    "usuario_id" UUID NOT NULL,
    "observacoes" TEXT,
    "criado_em" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "retiradas_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "fotos_retirada" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "retirada_id" UUID NOT NULL,
    "url" TEXT NOT NULL,

    CONSTRAINT "fotos_retirada_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "retiradas_aluguel_id_idx" ON "retiradas"("aluguel_id");

-- CreateIndex
CREATE INDEX "alugueis_item_id_data_inicio_data_fim_idx" ON "alugueis"("item_id", "data_inicio", "data_fim");

-- CreateIndex
CREATE INDEX "alugueis_locador_id_status_idx" ON "alugueis"("locador_id", "status");

-- CreateIndex
CREATE INDEX "alugueis_locatario_id_status_idx" ON "alugueis"("locatario_id", "status");

-- CreateIndex
CREATE INDEX "fotos_item_item_id_idx" ON "fotos_item"("item_id");

-- CreateIndex
CREATE INDEX "itens_usuario_id_idx" ON "itens"("usuario_id");

-- CreateIndex
CREATE INDEX "itens_categoria_id_idx" ON "itens"("categoria_id");

-- CreateIndex
CREATE INDEX "itens_disponivel_arquivado_idx" ON "itens"("disponivel", "arquivado");

-- CreateIndex
CREATE INDEX "notificacoes_usuario_id_lida_idx" ON "notificacoes"("usuario_id", "lida");

-- CreateIndex
CREATE INDEX "pagamentos_aluguel_id_idx" ON "pagamentos"("aluguel_id");

-- AddForeignKey
ALTER TABLE "retiradas" ADD CONSTRAINT "retiradas_aluguel_id_fkey" FOREIGN KEY ("aluguel_id") REFERENCES "alugueis"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "retiradas" ADD CONSTRAINT "retiradas_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "usuarios"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "fotos_retirada" ADD CONSTRAINT "fotos_retirada_retirada_id_fkey" FOREIGN KEY ("retirada_id") REFERENCES "retiradas"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "Resetar_Senha" ADD CONSTRAINT "Resetar_Senha_userId_fkey" FOREIGN KEY ("userId") REFERENCES "usuarios"("id") ON DELETE CASCADE ON UPDATE CASCADE;
