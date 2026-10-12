-- Extensão aditiva dos modelos existentes para os contratos administrativos.
ALTER TABLE "usuarios" ADD COLUMN "motivo_suspensao" TEXT;

ALTER TABLE "itens"
  ADD COLUMN "oculto_pelo_admin" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "motivo_ocultacao" TEXT;

ALTER TABLE "avaliacoes"
  ADD COLUMN "oculta" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "motivo_ocultacao" TEXT;

ALTER TABLE "categorias"
  ADD COLUMN "icone" VARCHAR(50) NOT NULL DEFAULT 'bi-tag',
  ADD COLUMN "cor" CHAR(7) NOT NULL DEFAULT '#6D49F2';

ALTER TABLE "verificacoes_identidade"
  ADD COLUMN "revogada" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "cancelado_em" TIMESTAMP(3);

ALTER TABLE "suportes"
  ADD COLUMN "prioridade" VARCHAR(20) NOT NULL DEFAULT 'normal',
  ADD COLUMN "motivo_improcedencia" TEXT;

ALTER TABLE "denuncias"
  ADD COLUMN "avaliacao_id" UUID,
  ADD COLUMN "prioridade" VARCHAR(20) NOT NULL DEFAULT 'normal',
  ADD COLUMN "motivo_improcedencia" TEXT;

ALTER TABLE "denuncias" ADD CONSTRAINT "denuncias_avaliacao_id_fkey"
  FOREIGN KEY ("avaliacao_id") REFERENCES "avaliacoes"("id") ON DELETE SET NULL ON UPDATE CASCADE;
CREATE INDEX "denuncias_avaliacao_id_idx" ON "denuncias"("avaliacao_id");

CREATE TABLE "respostas_ocorrencia" (
  "id" UUID NOT NULL,
  "suporte_id" UUID,
  "denuncia_id" UUID,
  "admin_id" UUID NOT NULL,
  "mensagem" TEXT NOT NULL,
  "criado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "respostas_ocorrencia_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "respostas_ocorrencia_origem_check" CHECK (num_nonnulls("suporte_id", "denuncia_id") = 1),
  CONSTRAINT "respostas_ocorrencia_suporte_id_fkey" FOREIGN KEY ("suporte_id") REFERENCES "suportes"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "respostas_ocorrencia_denuncia_id_fkey" FOREIGN KEY ("denuncia_id") REFERENCES "denuncias"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "respostas_ocorrencia_admin_id_fkey" FOREIGN KEY ("admin_id") REFERENCES "usuarios"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE INDEX "respostas_ocorrencia_suporte_id_criado_em_idx" ON "respostas_ocorrencia"("suporte_id", "criado_em");
CREATE INDEX "respostas_ocorrencia_denuncia_id_criado_em_idx" ON "respostas_ocorrencia"("denuncia_id", "criado_em");

CREATE TABLE "notificacoes_admin" (
  "id" UUID NOT NULL,
  "tipo" VARCHAR(80) NOT NULL,
  "categoria" VARCHAR(30) NOT NULL,
  "prioridade" VARCHAR(10) NOT NULL DEFAULT 'normal',
  "titulo" VARCHAR(150) NOT NULL,
  "mensagem" TEXT NOT NULL,
  "referencia_tipo" VARCHAR(40),
  "referencia_id" UUID,
  "chave_deduplicacao" TEXT,
  "tratado_por_id" UUID,
  "tratada_em" TIMESTAMP(3),
  "criado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "notificacoes_admin_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "notificacoes_admin_tratado_por_id_fkey" FOREIGN KEY ("tratado_por_id") REFERENCES "usuarios"("id") ON DELETE SET NULL ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "notificacoes_admin_chave_deduplicacao_key" ON "notificacoes_admin"("chave_deduplicacao");
CREATE INDEX "notificacoes_admin_categoria_prioridade_criado_em_idx" ON "notificacoes_admin"("categoria", "prioridade", "criado_em");
CREATE INDEX "notificacoes_admin_referencia_tipo_referencia_id_idx" ON "notificacoes_admin"("referencia_tipo", "referencia_id");

CREATE TABLE "notificacoes_admin_estado" (
  "notificacao_id" UUID NOT NULL,
  "admin_id" UUID NOT NULL,
  "lida" BOOLEAN NOT NULL DEFAULT false,
  "dispensada" BOOLEAN NOT NULL DEFAULT false,
  "lida_em" TIMESTAMP(3),
  "dispensada_em" TIMESTAMP(3),
  CONSTRAINT "notificacoes_admin_estado_pkey" PRIMARY KEY ("notificacao_id", "admin_id"),
  CONSTRAINT "notificacoes_admin_estado_notificacao_id_fkey" FOREIGN KEY ("notificacao_id") REFERENCES "notificacoes_admin"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "notificacoes_admin_estado_admin_id_fkey" FOREIGN KEY ("admin_id") REFERENCES "usuarios"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "notificacoes_admin_estado_admin_id_lida_dispensada_idx" ON "notificacoes_admin_estado"("admin_id", "lida", "dispensada");

CREATE TABLE "notificacoes_admin_preferencias" (
  "admin_id" UUID NOT NULL,
  "categorias" JSONB NOT NULL DEFAULT '{}',
  "somente_urgentes" BOOLEAN NOT NULL DEFAULT false,
  "atualizado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "notificacoes_admin_preferencias_pkey" PRIMARY KEY ("admin_id"),
  CONSTRAINT "notificacoes_admin_preferencias_admin_id_fkey" FOREIGN KEY ("admin_id") REFERENCES "usuarios"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE "comunicados_admin" (
  "id" UUID NOT NULL,
  "titulo" VARCHAR(150) NOT NULL,
  "mensagem" TEXT NOT NULL,
  "destinatarios" VARCHAR(30) NOT NULL,
  "status" VARCHAR(20) NOT NULL DEFAULT 'rascunho',
  "agendada_para" TIMESTAMP(3),
  "enviada_em" TIMESTAMP(3),
  "criado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "atualizado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "total_destinatarios" INTEGER NOT NULL DEFAULT 0,
  "erro_envio" TEXT,
  "chave_idempotencia" TEXT,
  "payload_hash" TEXT,
  "lease_ate" TIMESTAMP(3),
  "tentativas" INTEGER NOT NULL DEFAULT 0,
  "criado_por_id" UUID NOT NULL,
  CONSTRAINT "comunicados_admin_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "comunicados_admin_criado_por_id_fkey" FOREIGN KEY ("criado_por_id") REFERENCES "usuarios"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "comunicados_admin_chave_idempotencia_key" ON "comunicados_admin"("chave_idempotencia");
CREATE INDEX "comunicados_admin_status_agendada_para_lease_ate_idx" ON "comunicados_admin"("status", "agendada_para", "lease_ate");

CREATE TABLE "comunicados_admin_entregas" (
  "comunicado_id" UUID NOT NULL,
  "usuario_id" UUID NOT NULL,
  "notificacao_id" UUID,
  "entregue_em" TIMESTAMP(3),
  "erro" TEXT,
  CONSTRAINT "comunicados_admin_entregas_pkey" PRIMARY KEY ("comunicado_id", "usuario_id"),
  CONSTRAINT "comunicados_admin_entregas_comunicado_id_fkey" FOREIGN KEY ("comunicado_id") REFERENCES "comunicados_admin"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "comunicados_admin_entregas_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "usuarios"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "comunicados_admin_entregas_notificacao_id_fkey" FOREIGN KEY ("notificacao_id") REFERENCES "notificacoes"("id") ON DELETE SET NULL ON UPDATE CASCADE
);
CREATE INDEX "comunicados_admin_entregas_comunicado_id_entregue_em_idx" ON "comunicados_admin_entregas"("comunicado_id", "entregue_em");
CREATE UNIQUE INDEX "comunicados_admin_entregas_notificacao_id_key" ON "comunicados_admin_entregas"("notificacao_id");

CREATE TABLE "email_outbox" (
  "id" UUID NOT NULL,
  "tipo" VARCHAR(60) NOT NULL,
  "destinatario" VARCHAR(150) NOT NULL,
  "payload" JSONB NOT NULL DEFAULT '{}',
  "chave" TEXT NOT NULL,
  "status" VARCHAR(20) NOT NULL DEFAULT 'pendente',
  "tentativas" INTEGER NOT NULL DEFAULT 0,
  "proxima_em" TIMESTAMP(3),
  "enviado_em" TIMESTAMP(3),
  "ultimo_erro" TEXT,
  "lease_ate" TIMESTAMP(3),
  "criado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "email_outbox_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "email_outbox_chave_key" ON "email_outbox"("chave");
CREATE INDEX "email_outbox_status_proxima_em_lease_ate_idx" ON "email_outbox"("status", "proxima_em", "lease_ate");
