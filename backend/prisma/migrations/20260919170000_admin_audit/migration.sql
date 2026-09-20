CREATE TABLE "admin_auditoria" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "admin_id" UUID NOT NULL,
  "acao" VARCHAR(80) NOT NULL,
  "entidade" VARCHAR(60) NOT NULL,
  "entidade_id" UUID NOT NULL,
  "metadata" JSONB NOT NULL DEFAULT '{}',
  "criado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "admin_auditoria_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "admin_auditoria_admin_id_fkey" FOREIGN KEY ("admin_id") REFERENCES "usuarios"("id") ON DELETE RESTRICT
);
CREATE INDEX "admin_auditoria_admin_id_idx" ON "admin_auditoria"("admin_id");
CREATE INDEX "admin_auditoria_entidade_entidade_id_idx" ON "admin_auditoria"("entidade", "entidade_id");
CREATE INDEX "admin_auditoria_criado_em_idx" ON "admin_auditoria"("criado_em");
