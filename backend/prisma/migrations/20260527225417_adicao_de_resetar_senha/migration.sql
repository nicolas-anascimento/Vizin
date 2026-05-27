-- CreateEnum
CREATE TYPE "Tipos" AS ENUM ('admin', 'usuario');

-- CreateTable
CREATE TABLE "alugueis" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "item_id" UUID NOT NULL,
    "locatario_id" UUID NOT NULL,
    "locador_id" UUID NOT NULL,
    "data_inicio" DATE NOT NULL,
    "data_fim" DATE NOT NULL,
    "valor_total" DECIMAL(10,2) NOT NULL,
    "taxa_plataforma" DECIMAL(10,2) NOT NULL DEFAULT 0.00,
    "ganho_locador" DECIMAL(10,2) NOT NULL DEFAULT 0.00,
    "status" VARCHAR(30) DEFAULT 'pendente',
    "criado_em" TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP,
    "atualizado_em" TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "alugueis_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "assinaturas" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "usuario_id" UUID NOT NULL,
    "plano_id" UUID NOT NULL,
    "status" VARCHAR(30) DEFAULT 'ativa',
    "inicio" DATE NOT NULL,
    "fim" DATE,
    "criado_em" TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "assinaturas_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "avaliacoes" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "aluguel_id" UUID NOT NULL,
    "avaliador_id" UUID NOT NULL,
    "avaliado_id" UUID NOT NULL,
    "nota" SMALLINT,
    "comentario" TEXT,
    "criado_em" TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "avaliacoes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "categorias" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "nome" VARCHAR(80) NOT NULL,

    CONSTRAINT "categorias_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "enderecos" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "usuario_id" UUID NOT NULL,
    "cep" VARCHAR(10) NOT NULL,
    "numero" VARCHAR(10) NOT NULL,
    "complemento" VARCHAR(100),
    "rua" VARCHAR(200),
    "bairro" VARCHAR(100),
    "cidade" VARCHAR(100),
    "estado" CHAR(2),
    "localizacao" geography,
    "principal" BOOLEAN DEFAULT false,

    CONSTRAINT "enderecos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "extrato_carteira" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "usuario_id" UUID NOT NULL,
    "valor" DECIMAL(10,2) NOT NULL,
    "tipo" VARCHAR(50),
    "descricao" TEXT,
    "referencia_id" UUID,
    "criado_em" TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "extrato_carteira_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "fotos_item" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "item_id" UUID NOT NULL,
    "url" TEXT NOT NULL,
    "principal" BOOLEAN DEFAULT false,

    CONSTRAINT "fotos_item_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "fundo_reserva" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "valor" DECIMAL(10,2) NOT NULL,
    "tipo" VARCHAR(50),
    "descricao" TEXT,
    "referencia_id" UUID,
    "criado_em" TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "fundo_reserva_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "itens" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "usuario_id" UUID NOT NULL,
    "categoria_id" UUID,
    "endereco_id" UUID,
    "titulo" VARCHAR(150) NOT NULL,
    "descricao" TEXT,
    "preco_por_dia" DECIMAL(10,2) NOT NULL,
    "valor_mercado" DECIMAL(10,2) NOT NULL,
    "disponivel" BOOLEAN DEFAULT true,
    "condicao" VARCHAR(20),
    "segurado" BOOLEAN DEFAULT false,
    "criado_em" TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP,
    "atualizado_em" TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "itens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "mensagens" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "remetente_id" UUID NOT NULL,
    "destinatario_id" UUID NOT NULL,
    "aluguel_id" UUID,
    "conteudo" TEXT NOT NULL,
    "lida" BOOLEAN DEFAULT false,
    "enviada_em" TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "mensagens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notificacoes" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "usuario_id" UUID NOT NULL,
    "tipo" VARCHAR(50),
    "titulo" VARCHAR(150),
    "mensagem" TEXT,
    "lida" BOOLEAN DEFAULT false,
    "criado_em" TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notificacoes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pagamentos" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "aluguel_id" UUID NOT NULL,
    "valor" DECIMAL(10,2) NOT NULL,
    "metodo" VARCHAR(50),
    "status" VARCHAR(30) DEFAULT 'pendente',
    "pago_em" TIMESTAMP(6),

    CONSTRAINT "pagamentos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "planos" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "nome" VARCHAR(80) NOT NULL,
    "preco" DECIMAL(10,2) NOT NULL,
    "descricao" TEXT,
    "beneficios" TEXT[],

    CONSTRAINT "planos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sinistros" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "aluguel_id" UUID NOT NULL,
    "reportador_id" UUID NOT NULL,
    "status" VARCHAR(30) DEFAULT 'aberto',
    "descricao" TEXT NOT NULL,
    "valor_solicitado" DECIMAL(10,2),
    "valor_aprovado" DECIMAL(10,2),
    "notas_analise" TEXT,
    "criado_em" TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP,
    "atualizado_em" TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sinistros_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "usuarios" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "nome" VARCHAR(100) NOT NULL,
    "email" VARCHAR(150) NOT NULL,
    "tipo" "Tipos" NOT NULL DEFAULT 'usuario',
    "senha_hash" TEXT NOT NULL,
    "telefone" VARCHAR(20),
    "foto_url" TEXT,
    "bio" TEXT,
    "cpf" VARCHAR(14),
    "verificado" BOOLEAN DEFAULT false,
    "saldo_carteira" DECIMAL(10,2) DEFAULT 0.00,
    "criado_em" TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP,
    "atualizado_em" TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "usuarios_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "verificacoes_identidade" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "usuario_id" UUID NOT NULL,
    "tipo" VARCHAR(50),
    "foto_url" TEXT,
    "status" VARCHAR(30) DEFAULT 'pendente',
    "analisado_em" TIMESTAMP(6),
    "criado_em" TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "verificacoes_identidade_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Resetar_Senha" (
    "id" TEXT NOT NULL,
    "userId" UUID NOT NULL,
    "pendente" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "Resetar_Senha_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "uq_avaliacao_aluguel_avaliador" ON "avaliacoes"("aluguel_id", "avaliador_id");

-- CreateIndex
CREATE UNIQUE INDEX "categorias_nome_key" ON "categorias"("nome");

-- CreateIndex
CREATE UNIQUE INDEX "uq_endereco_principal" ON "enderecos"("usuario_id") WHERE (principal = true);

-- CreateIndex
CREATE INDEX "idx_enderecos_localizacao" ON "enderecos" USING GIST ("localizacao");

-- CreateIndex
CREATE UNIQUE INDEX "uq_foto_principal" ON "fotos_item"("item_id") WHERE (principal = true);

-- CreateIndex
CREATE INDEX "idx_mensagens_aluguel" ON "mensagens"("aluguel_id");

-- CreateIndex
CREATE INDEX "idx_mensagens_destinatario" ON "mensagens"("destinatario_id");

-- CreateIndex
CREATE INDEX "idx_mensagens_remetente" ON "mensagens"("remetente_id");

-- CreateIndex
CREATE UNIQUE INDEX "usuarios_email_key" ON "usuarios"("email");

-- CreateIndex
CREATE UNIQUE INDEX "usuarios_cpf_key" ON "usuarios"("cpf");

-- AddForeignKey
ALTER TABLE "alugueis" ADD CONSTRAINT "alugueis_item_id_fkey" FOREIGN KEY ("item_id") REFERENCES "itens"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "alugueis" ADD CONSTRAINT "alugueis_locador_id_fkey" FOREIGN KEY ("locador_id") REFERENCES "usuarios"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "alugueis" ADD CONSTRAINT "alugueis_locatario_id_fkey" FOREIGN KEY ("locatario_id") REFERENCES "usuarios"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "assinaturas" ADD CONSTRAINT "assinaturas_plano_id_fkey" FOREIGN KEY ("plano_id") REFERENCES "planos"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "assinaturas" ADD CONSTRAINT "assinaturas_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "usuarios"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "avaliacoes" ADD CONSTRAINT "avaliacoes_aluguel_id_fkey" FOREIGN KEY ("aluguel_id") REFERENCES "alugueis"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "avaliacoes" ADD CONSTRAINT "avaliacoes_avaliado_id_fkey" FOREIGN KEY ("avaliado_id") REFERENCES "usuarios"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "avaliacoes" ADD CONSTRAINT "avaliacoes_avaliador_id_fkey" FOREIGN KEY ("avaliador_id") REFERENCES "usuarios"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "enderecos" ADD CONSTRAINT "enderecos_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "usuarios"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "extrato_carteira" ADD CONSTRAINT "extrato_carteira_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "usuarios"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "fotos_item" ADD CONSTRAINT "fotos_item_item_id_fkey" FOREIGN KEY ("item_id") REFERENCES "itens"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "itens" ADD CONSTRAINT "itens_categoria_id_fkey" FOREIGN KEY ("categoria_id") REFERENCES "categorias"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "itens" ADD CONSTRAINT "itens_endereco_id_fkey" FOREIGN KEY ("endereco_id") REFERENCES "enderecos"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "itens" ADD CONSTRAINT "itens_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "usuarios"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "mensagens" ADD CONSTRAINT "mensagens_aluguel_id_fkey" FOREIGN KEY ("aluguel_id") REFERENCES "alugueis"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "mensagens" ADD CONSTRAINT "mensagens_destinatario_id_fkey" FOREIGN KEY ("destinatario_id") REFERENCES "usuarios"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "mensagens" ADD CONSTRAINT "mensagens_remetente_id_fkey" FOREIGN KEY ("remetente_id") REFERENCES "usuarios"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "notificacoes" ADD CONSTRAINT "notificacoes_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "usuarios"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "pagamentos" ADD CONSTRAINT "pagamentos_aluguel_id_fkey" FOREIGN KEY ("aluguel_id") REFERENCES "alugueis"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "sinistros" ADD CONSTRAINT "sinistros_aluguel_id_fkey" FOREIGN KEY ("aluguel_id") REFERENCES "alugueis"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "sinistros" ADD CONSTRAINT "sinistros_reportador_id_fkey" FOREIGN KEY ("reportador_id") REFERENCES "usuarios"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "verificacoes_identidade" ADD CONSTRAINT "verificacoes_identidade_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "usuarios"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "Resetar_Senha" ADD CONSTRAINT "Resetar_Senha_userId_fkey" FOREIGN KEY ("userId") REFERENCES "usuarios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
