ALTER TABLE "alugueis" ADD COLUMN "cancelado_por" VARCHAR(60);
ALTER TABLE "notificacoes" ADD COLUMN "chave" TEXT;
CREATE UNIQUE INDEX "notificacoes_chave_key" ON "notificacoes"("chave");
ALTER TABLE "denuncias" ADD COLUMN "etapa" VARCHAR(20);
ALTER TABLE "denuncias" ADD COLUMN "relato_chave" TEXT;
CREATE UNIQUE INDEX "denuncias_relato_chave_key" ON "denuncias"("relato_chave");

CREATE TABLE "multas_aluguel" (
  "aluguel_id" UUID NOT NULL,
  "dias_atraso" INTEGER NOT NULL,
  "valor_dia" DECIMAL(10,2) NOT NULL,
  "valor_total" DECIMAL(10,2) NOT NULL,
  "valor_plataforma" DECIMAL(10,2) NOT NULL,
  "valor_proprietario" DECIMAL(10,2) NOT NULL,
  "status" VARCHAR(30) NOT NULL DEFAULT 'pendente',
  "calculado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "atualizado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "multas_aluguel_pkey" PRIMARY KEY ("aluguel_id"),
  CONSTRAINT "multas_aluguel_aluguel_id_fkey" FOREIGN KEY ("aluguel_id") REFERENCES "alugueis"("id") ON DELETE CASCADE,
  CONSTRAINT "multas_aluguel_status_check" CHECK ("status" IN ('pendente','paga','contestada')),
  CONSTRAINT "multas_aluguel_valores_check" CHECK ("dias_atraso" >= 1 AND "valor_dia" >= 0 AND "valor_total" = "valor_plataforma" + "valor_proprietario")
);
CREATE INDEX "multas_aluguel_status_idx" ON "multas_aluguel"("status");
