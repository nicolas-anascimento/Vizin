-- Preserva a hora da confirmação no período mensal pago. Datas históricas
-- continuam representando meia-noite, sem apagar nem reescrever o histórico.
ALTER TABLE "assinaturas"
  ALTER COLUMN "inicio" TYPE TIMESTAMP(6) USING "inicio"::TIMESTAMP(6),
  ALTER COLUMN "fim" TYPE TIMESTAMP(6) USING "fim"::TIMESTAMP(6);
