-- O modelo financeiro novo é aditivo. Tabelas de pagamentos, multas, carteira e
-- conciliação de aluguéis permanecem intactas para consulta histórica.
ALTER TABLE "planos"
  ADD COLUMN "codigo" VARCHAR(30),
  ADD COLUMN "preco_centavos" INTEGER,
  ADD COLUMN "limite_publicacoes" INTEGER,
  ADD COLUMN "periodo" VARCHAR(20) NOT NULL DEFAULT 'mensal',
  ADD COLUMN "ativo" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "criado_em" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ADD COLUMN "atualizado_em" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- Instalações antigas podem conter planos experimentais. Eles são preservados,
-- recebem código estável e ficam inativos até revisão administrativa.
UPDATE "planos"
SET "codigo" = 'legado-' || "id"::text,
    "preco_centavos" = ROUND("preco" * 100)::integer,
    "limite_publicacoes" = 0,
    "ativo" = false
WHERE "codigo" IS NULL;

INSERT INTO "planos" ("id", "codigo", "nome", "preco", "preco_centavos", "limite_publicacoes", "periodo", "ativo", "descricao", "beneficios")
VALUES
  (gen_random_uuid(), 'gratuito', 'Gratuito', 0.00, 0, 1, 'mensal', true, 'Uma nova publicação por mês civil.', ARRAY['1 publicação por mês']),
  (gen_random_uuid(), 'intermediario', 'Intermediário', 29.99, 2999, 10, 'mensal', true, 'Até dez novas publicações por período contratado.', ARRAY['10 publicações por mês']),
  (gen_random_uuid(), 'avancado', 'Avançado', 59.99, 5999, 30, 'mensal', true, 'Até trinta novas publicações por período contratado.', ARRAY['30 publicações por mês'])
ON CONFLICT DO NOTHING;

ALTER TABLE "planos"
  ALTER COLUMN "codigo" SET NOT NULL,
  ALTER COLUMN "preco_centavos" SET NOT NULL,
  ALTER COLUMN "limite_publicacoes" SET NOT NULL;
CREATE UNIQUE INDEX "planos_codigo_key" ON "planos"("codigo");
ALTER TABLE "planos" ADD CONSTRAINT "planos_preco_centavos_check" CHECK ("preco_centavos" >= 0);
ALTER TABLE "planos" ADD CONSTRAINT "planos_limite_publicacoes_check" CHECK ("limite_publicacoes" >= 0);

ALTER TABLE "assinaturas"
  ADD COLUMN "cancelar_ao_final" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "renovacao_habilitada" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "referencia_provedor" VARCHAR(200),
  ADD COLUMN "proxima_cobranca" TIMESTAMP(3),
  ADD COLUMN "atualizado_em" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "assinaturas" ALTER COLUMN "status" SET DEFAULT 'pendente';
CREATE UNIQUE INDEX "assinaturas_referencia_provedor_key" ON "assinaturas"("referencia_provedor");
CREATE INDEX "assinaturas_usuario_id_status_fim_idx" ON "assinaturas"("usuario_id", "status", "fim");
-- Assinaturas preexistentes são histórico de um produto anterior e podem ter
-- períodos sobrepostos. Novas contratações são serializadas pelo lock do usuário,
-- sem impor uma restrição retroativa que inviabilize a migration.

CREATE TABLE "pagamentos_assinatura" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "assinatura_id" UUID NOT NULL,
  "usuario_id" UUID NOT NULL,
  "plano_id" UUID NOT NULL,
  "valor_centavos" INTEGER NOT NULL,
  "status" VARCHAR(30) NOT NULL DEFAULT 'pendente',
  "provedor" VARCHAR(40) NOT NULL,
  "referencia_pagamento" VARCHAR(200),
  "chave_idempotencia" VARCHAR(200) NOT NULL,
  "metodo" VARCHAR(30),
  "dados" JSONB NOT NULL DEFAULT '{}',
  "criado_em" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "atualizado_em" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "confirmado_em" TIMESTAMP(6),
  CONSTRAINT "pagamentos_assinatura_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "pagamentos_assinatura_valor_check" CHECK ("valor_centavos" >= 0),
  CONSTRAINT "pagamentos_assinatura_assinatura_id_fkey" FOREIGN KEY ("assinatura_id") REFERENCES "assinaturas"("id") ON DELETE RESTRICT,
  CONSTRAINT "pagamentos_assinatura_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "usuarios"("id") ON DELETE RESTRICT,
  CONSTRAINT "pagamentos_assinatura_plano_id_fkey" FOREIGN KEY ("plano_id") REFERENCES "planos"("id") ON DELETE RESTRICT
);
CREATE UNIQUE INDEX "pagamentos_assinatura_referencia_pagamento_key" ON "pagamentos_assinatura"("referencia_pagamento");
CREATE UNIQUE INDEX "pagamentos_assinatura_chave_idempotencia_key" ON "pagamentos_assinatura"("chave_idempotencia");
CREATE INDEX "pagamentos_assinatura_usuario_id_criado_em_idx" ON "pagamentos_assinatura"("usuario_id", "criado_em");
CREATE INDEX "pagamentos_assinatura_status_criado_em_idx" ON "pagamentos_assinatura"("status", "criado_em");

CREATE TABLE "publicacoes_anuncio" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "usuario_id" UUID NOT NULL,
  "objeto_id" UUID NOT NULL,
  "assinatura_id" UUID,
  "plano_codigo" VARCHAR(30) NOT NULL,
  "periodo_inicio" TIMESTAMP(6) NOT NULL,
  "periodo_fim" TIMESTAMP(6) NOT NULL,
  "chave_idempotencia" VARCHAR(200) NOT NULL,
  "fingerprint" VARCHAR(64) NOT NULL,
  "criado_em" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "publicacoes_anuncio_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "publicacoes_anuncio_periodo_check" CHECK ("periodo_fim" > "periodo_inicio"),
  CONSTRAINT "publicacoes_anuncio_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "usuarios"("id") ON DELETE RESTRICT,
  CONSTRAINT "publicacoes_anuncio_objeto_id_fkey" FOREIGN KEY ("objeto_id") REFERENCES "itens"("id") ON DELETE RESTRICT,
  CONSTRAINT "publicacoes_anuncio_assinatura_id_fkey" FOREIGN KEY ("assinatura_id") REFERENCES "assinaturas"("id") ON DELETE RESTRICT
);
CREATE UNIQUE INDEX "publicacoes_anuncio_objeto_id_key" ON "publicacoes_anuncio"("objeto_id");
CREATE UNIQUE INDEX "publicacoes_anuncio_usuario_id_chave_idempotencia_key" ON "publicacoes_anuncio"("usuario_id", "chave_idempotencia");
CREATE INDEX "publicacoes_anuncio_usuario_id_periodo_inicio_periodo_fim_idx" ON "publicacoes_anuncio"("usuario_id", "periodo_inicio", "periodo_fim");
CREATE INDEX "publicacoes_anuncio_assinatura_id_idx" ON "publicacoes_anuncio"("assinatura_id");
