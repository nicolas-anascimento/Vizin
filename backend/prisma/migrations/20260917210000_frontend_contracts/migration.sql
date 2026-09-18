BEGIN;
-- AlterTable
ALTER TABLE "alugueis" ADD COLUMN     "atraso_notificado" TEXT,
ADD COLUMN     "expira_em" TIMESTAMP(3),
ADD COLUMN     "pagamento_ate" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "categorias" ADD COLUMN "slug" VARCHAR(100);
CREATE EXTENSION IF NOT EXISTS unaccent;
UPDATE categorias SET slug = trim(both '-' from regexp_replace(lower(unaccent(nome)), '[^a-z0-9]+', '-', 'g'));
UPDATE categorias SET slug = 'casajardim' WHERE slug IN ('casa-e-jardim', 'casa-jardim', 'casajardim');
-- Consolidate duplicate categories preserving every item relation.
WITH canonical AS (SELECT slug, min(id::text)::uuid AS id FROM categorias GROUP BY slug)
UPDATE itens i SET categoria_id = c.id FROM categorias old, canonical c WHERE i.categoria_id = old.id AND old.slug = c.slug;
DELETE FROM categorias c WHERE c.id::text <> (SELECT min(other.id::text) FROM categorias other WHERE other.slug = c.slug);
ALTER TABLE categorias ALTER COLUMN slug SET NOT NULL;

-- AlterTable
ALTER TABLE "enderecos" ADD COLUMN     "latitude" DOUBLE PRECISION,
ADD COLUMN     "longitude" DOUBLE PRECISION;

-- AlterTable
ALTER TABLE "mensagens" ADD COLUMN     "anexo_id" UUID,
ADD COLUMN     "conversa_id" UUID;

-- AlterTable
ALTER TABLE "notificacoes" ADD COLUMN     "contexto" JSONB NOT NULL DEFAULT '{}';

-- AlterTable
ALTER TABLE "pagamentos" ADD COLUMN     "criado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "dados" JSONB NOT NULL DEFAULT '{}',
ADD COLUMN     "gateway" TEXT NOT NULL DEFAULT 'simulado',
ADD COLUMN     "idempotencia" TEXT,
ADD COLUMN     "referencia" TEXT;

-- AlterTable
ALTER TABLE "retiradas" ADD COLUMN     "confirmado" BOOLEAN NOT NULL DEFAULT true;

-- AlterTable
ALTER TABLE "usuarios" ADD COLUMN     "preferencias" JSONB NOT NULL DEFAULT '{}',
ADD COLUMN     "privacidade" JSONB NOT NULL DEFAULT '{}';

-- AlterTable
ALTER TABLE "verificacoes_identidade" ADD COLUMN     "documentos" JSONB NOT NULL DEFAULT '{}',
ADD COLUMN     "motivo" TEXT,
ADD COLUMN     "revisor_id" UUID;

-- CreateTable
CREATE TABLE "eventos_aluguel" (
    "id" UUID NOT NULL,
    "aluguel_id" UUID NOT NULL,
    "usuario_id" UUID,
    "status" TEXT NOT NULL,
    "motivo" TEXT,
    "criado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "eventos_aluguel_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "devolucoes" (
    "id" UUID NOT NULL,
    "aluguel_id" UUID NOT NULL,
    "usuario_id" UUID NOT NULL,
    "fotos" JSONB NOT NULL,
    "observacoes" TEXT,
    "danos" TEXT,
    "confirmado" BOOLEAN NOT NULL DEFAULT true,
    "criado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "devolucoes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "suportes" (
    "id" UUID NOT NULL,
    "usuario_id" UUID NOT NULL,
    "assunto" VARCHAR(150) NOT NULL,
    "mensagem" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'aberto',
    "protocolo" TEXT NOT NULL,
    "resposta" TEXT,
    "criado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizado_em" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "suportes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "denuncias" (
    "id" UUID NOT NULL,
    "usuario_id" UUID NOT NULL,
    "denunciado_id" UUID,
    "objeto_id" UUID,
    "aluguel_id" UUID,
    "conversa_id" UUID,
    "motivo" TEXT NOT NULL,
    "assunto" TEXT,
    "mensagem" TEXT NOT NULL,
    "evidencias" JSONB NOT NULL DEFAULT '[]',
    "status" TEXT NOT NULL DEFAULT 'aberta',
    "protocolo" TEXT NOT NULL,
    "notas" TEXT,
    "criado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizado_em" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "denuncias_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "conversas" (
    "id" UUID NOT NULL,
    "chave" TEXT NOT NULL,
    "objeto_id" UUID,
    "criado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizado_em" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "conversas_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "participantes_conversa" (
    "conversa_id" UUID NOT NULL,
    "usuario_id" UUID NOT NULL,
    "arquivada" BOOLEAN NOT NULL DEFAULT false,
    "lida_em" TIMESTAMP(3),

    CONSTRAINT "participantes_conversa_pkey" PRIMARY KEY ("conversa_id","usuario_id")
);

-- CreateTable
CREATE TABLE "anexos" (
    "id" UUID NOT NULL,
    "usuario_id" UUID NOT NULL,
    "caminho" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "mime" TEXT NOT NULL,
    "tamanho" INTEGER NOT NULL,
    "criado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "anexos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bloqueios" (
    "usuario_id" UUID NOT NULL,
    "bloqueado_id" UUID NOT NULL,
    "criado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "bloqueios_pkey" PRIMARY KEY ("usuario_id","bloqueado_id")
);

-- CreateTable
CREATE TABLE "emails_pendentes" (
    "id" UUID NOT NULL,
    "usuario_id" UUID NOT NULL,
    "email" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "expira_em" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "emails_pendentes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "webhook_eventos" (
    "id" TEXT NOT NULL,
    "criado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "webhook_eventos_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "eventos_aluguel_aluguel_id_criado_em_idx" ON "eventos_aluguel"("aluguel_id", "criado_em");

-- CreateIndex
CREATE UNIQUE INDEX "devolucoes_aluguel_id_usuario_id_key" ON "devolucoes"("aluguel_id", "usuario_id");

-- CreateIndex
CREATE UNIQUE INDEX "suportes_protocolo_key" ON "suportes"("protocolo");

-- CreateIndex
CREATE INDEX "suportes_status_criado_em_idx" ON "suportes"("status", "criado_em");

-- CreateIndex
CREATE UNIQUE INDEX "denuncias_protocolo_key" ON "denuncias"("protocolo");

-- CreateIndex
CREATE INDEX "denuncias_status_criado_em_idx" ON "denuncias"("status", "criado_em");

-- CreateIndex
CREATE UNIQUE INDEX "conversas_chave_key" ON "conversas"("chave");

-- CreateIndex
CREATE INDEX "participantes_conversa_usuario_id_arquivada_idx" ON "participantes_conversa"("usuario_id", "arquivada");

-- CreateIndex
CREATE UNIQUE INDEX "emails_pendentes_usuario_id_key" ON "emails_pendentes"("usuario_id");

-- CreateIndex
CREATE UNIQUE INDEX "emails_pendentes_token_key" ON "emails_pendentes"("token");

-- CreateIndex
CREATE UNIQUE INDEX "categorias_slug_key" ON "categorias"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "mensagens_anexo_id_key" ON "mensagens"("anexo_id");

-- CreateIndex
CREATE UNIQUE INDEX "pagamentos_referencia_key" ON "pagamentos"("referencia");

-- CreateIndex
CREATE UNIQUE INDEX "pagamentos_idempotencia_key" ON "pagamentos"("idempotencia");

-- CreateIndex
CREATE UNIQUE INDEX "retiradas_aluguel_id_usuario_id_key" ON "retiradas"("aluguel_id", "usuario_id");

-- AddForeignKey
ALTER TABLE "mensagens" ADD CONSTRAINT "mensagens_conversa_id_fkey" FOREIGN KEY ("conversa_id") REFERENCES "conversas"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mensagens" ADD CONSTRAINT "mensagens_anexo_id_fkey" FOREIGN KEY ("anexo_id") REFERENCES "anexos"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "eventos_aluguel" ADD CONSTRAINT "eventos_aluguel_aluguel_id_fkey" FOREIGN KEY ("aluguel_id") REFERENCES "alugueis"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "devolucoes" ADD CONSTRAINT "devolucoes_aluguel_id_fkey" FOREIGN KEY ("aluguel_id") REFERENCES "alugueis"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "devolucoes" ADD CONSTRAINT "devolucoes_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "usuarios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "suportes" ADD CONSTRAINT "suportes_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "usuarios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "denuncias" ADD CONSTRAINT "denuncias_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "usuarios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "denuncias" ADD CONSTRAINT "denuncias_denunciado_id_fkey" FOREIGN KEY ("denunciado_id") REFERENCES "usuarios"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "participantes_conversa" ADD CONSTRAINT "participantes_conversa_conversa_id_fkey" FOREIGN KEY ("conversa_id") REFERENCES "conversas"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "participantes_conversa" ADD CONSTRAINT "participantes_conversa_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "usuarios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "anexos" ADD CONSTRAINT "anexos_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "usuarios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bloqueios" ADD CONSTRAINT "bloqueios_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "usuarios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bloqueios" ADD CONSTRAINT "bloqueios_bloqueado_id_fkey" FOREIGN KEY ("bloqueado_id") REFERENCES "usuarios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "emails_pendentes" ADD CONSTRAINT "emails_pendentes_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "usuarios"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Preserve CPF conflicts for manual correction rather than inventing or discarding identities.
DO $$ BEGIN
 IF EXISTS (SELECT 1 FROM usuarios WHERE cpf IS NOT NULL GROUP BY regexp_replace(cpf,'[^0-9]','','g') HAVING count(*)>1) THEN
  RAISE EXCEPTION 'CPFs legados colidem após normalização. Corrija os registros antes de aplicar esta migration.';
 END IF;
END $$;
UPDATE usuarios SET cpf = regexp_replace(cpf,'[^0-9]','','g') WHERE cpf IS NOT NULL;
CREATE FUNCTION vizin_cpf_valido(value text) RETURNS boolean LANGUAGE plpgsql IMMUTABLE AS $$
DECLARE soma int; digito int; n int; i int;
BEGIN
 IF value IS NULL OR value !~ '^[0-9]{11}$' OR value ~ '^(.)\1{10}$' THEN RETURN false; END IF;
 FOR n IN 9..10 LOOP
  soma := 0;
  FOR i IN 1..n LOOP soma := soma + substring(value,i,1)::int * (n+2-i); END LOOP;
  digito := ((soma * 10) % 11) % 10;
  IF digito <> substring(value,n+1,1)::int THEN RETURN false; END IF;
 END LOOP;
 RETURN true;
END $$;
-- Legacy accounts without valid CPF are retained but cannot authenticate until corrected by admin.
UPDATE usuarios SET ativo=false, token_version=token_version+1 WHERE NOT vizin_cpf_valido(cpf);
ALTER TABLE usuarios ADD CONSTRAINT usuarios_cpf_ativo_check CHECK (NOT ativo OR vizin_cpf_valido(cpf));
UPDATE alugueis SET status='recusado' WHERE status='rejeitado';
UPDATE alugueis SET status='finalizado' WHERE status='concluido';
UPDATE alugueis SET status='retirado' WHERE status='aguardando_devolucao';
ALTER TABLE alugueis ADD CONSTRAINT alugueis_status_check CHECK (status IN ('pendente','aprovado','recusado','pago','retirado','devolvido','finalizado','cancelado')) NOT VALID;
ALTER TABLE alugueis ADD CONSTRAINT alugueis_datas_check CHECK (data_fim >= data_inicio) NOT VALID;
ALTER TABLE avaliacoes ADD CONSTRAINT avaliacoes_nota_check CHECK (nota BETWEEN 1 AND 5) NOT VALID;
ALTER TABLE itens ADD CONSTRAINT itens_preco_check CHECK (preco_por_dia > 0 AND valor_mercado > 0) NOT VALID;
-- Backfill known legacy timestamps so expiration and spatial search work immediately.
UPDATE alugueis SET expira_em=coalesce(criado_em,now()) + interval '48 hours' WHERE status='pendente';
UPDATE alugueis SET pagamento_ate=coalesce(atualizado_em,now()) + interval '24 hours' WHERE status='aprovado';
UPDATE enderecos SET latitude=ST_Y(localizacao::geometry), longitude=ST_X(localizacao::geometry) WHERE localizacao IS NOT NULL;
INSERT INTO eventos_aluguel(id,aluguel_id,status,motivo,criado_em) SELECT gen_random_uuid(),id,coalesce(status,'pendente'),'Estado legado preservado',coalesce(atualizado_em,now()) FROM alugueis;
CREATE INDEX mensagens_conversa_data_idx ON mensagens(conversa_id,enviada_em);
CREATE UNIQUE INDEX pagamentos_um_pago_por_aluguel ON pagamentos(aluguel_id) WHERE status='pago';
CREATE EXTENSION IF NOT EXISTS btree_gist;
-- Database protection against overlapping reservations, including requests outside the API.
ALTER TABLE alugueis ADD CONSTRAINT alugueis_sem_sobreposicao EXCLUDE USING gist (item_id WITH =, daterange(data_inicio, data_fim, '[]') WITH &&) WHERE (status IN ('pendente','aprovado','pago','retirado'));
COMMIT;
