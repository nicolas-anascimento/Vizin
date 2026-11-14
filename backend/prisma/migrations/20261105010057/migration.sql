-- DropForeignKey
ALTER TABLE "pagamentos_assinatura" DROP CONSTRAINT "pagamentos_assinatura_assinatura_id_fkey";

-- DropForeignKey
ALTER TABLE "pagamentos_assinatura" DROP CONSTRAINT "pagamentos_assinatura_plano_id_fkey";

-- DropForeignKey
ALTER TABLE "pagamentos_assinatura" DROP CONSTRAINT "pagamentos_assinatura_usuario_id_fkey";

-- DropForeignKey
ALTER TABLE "publicacoes_anuncio" DROP CONSTRAINT "publicacoes_anuncio_assinatura_id_fkey";

-- DropForeignKey
ALTER TABLE "publicacoes_anuncio" DROP CONSTRAINT "publicacoes_anuncio_objeto_id_fkey";

-- DropForeignKey
ALTER TABLE "publicacoes_anuncio" DROP CONSTRAINT "publicacoes_anuncio_usuario_id_fkey";

-- AddForeignKey
ALTER TABLE "pagamentos_assinatura" ADD CONSTRAINT "pagamentos_assinatura_assinatura_id_fkey" FOREIGN KEY ("assinatura_id") REFERENCES "assinaturas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pagamentos_assinatura" ADD CONSTRAINT "pagamentos_assinatura_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "usuarios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pagamentos_assinatura" ADD CONSTRAINT "pagamentos_assinatura_plano_id_fkey" FOREIGN KEY ("plano_id") REFERENCES "planos"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "publicacoes_anuncio" ADD CONSTRAINT "publicacoes_anuncio_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "usuarios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "publicacoes_anuncio" ADD CONSTRAINT "publicacoes_anuncio_objeto_id_fkey" FOREIGN KEY ("objeto_id") REFERENCES "itens"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "publicacoes_anuncio" ADD CONSTRAINT "publicacoes_anuncio_assinatura_id_fkey" FOREIGN KEY ("assinatura_id") REFERENCES "assinaturas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
