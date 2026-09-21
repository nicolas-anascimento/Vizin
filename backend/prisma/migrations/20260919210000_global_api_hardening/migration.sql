ALTER TABLE "pagamentos" ADD COLUMN "conciliacao_tentativas" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "pagamentos" ADD COLUMN "status_em" TIMESTAMP(3);
UPDATE "pagamentos" SET "status_em" = COALESCE("pago_em", "criado_em");
ALTER TABLE "pagamentos" ALTER COLUMN "status_em" SET NOT NULL;
ALTER TABLE "pagamentos" ALTER COLUMN "status_em" SET DEFAULT CURRENT_TIMESTAMP;
CREATE FUNCTION vizin_pagamento_status_em() RETURNS trigger AS $$
BEGIN
  IF NEW.status IS DISTINCT FROM OLD.status THEN NEW.status_em := CURRENT_TIMESTAMP; END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER pagamentos_status_em BEFORE UPDATE ON pagamentos FOR EACH ROW EXECUTE FUNCTION vizin_pagamento_status_em();
ALTER TABLE "pagamentos" ADD COLUMN "conciliacao_proxima_em" TIMESTAMP(3);
ALTER TABLE "pagamentos" ADD COLUMN "conciliacao_lease_ate" TIMESTAMP(3);
CREATE INDEX "pagamentos_gateway_metodo_status_conciliacao_proxima_em_idx" ON "pagamentos"("gateway", "metodo", "status", "conciliacao_proxima_em");

ALTER TABLE "operacoes_gateway" ADD COLUMN "proxima_tentativa_em" TIMESTAMP(3);
CREATE INDEX "operacoes_gateway_tipo_estado_proxima_tentativa_em_idx" ON "operacoes_gateway"("tipo", "estado", "proxima_tentativa_em");

ALTER TABLE "webhook_eventos" ADD COLUMN "tentativas" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "webhook_eventos" ADD COLUMN "proxima_tentativa_em" TIMESTAMP(3);
ALTER TABLE "webhook_eventos" ADD COLUMN "lease_ate" TIMESTAMP(3);
CREATE INDEX "webhook_eventos_processado_em_proxima_tentativa_em_lease_ate_idx" ON "webhook_eventos"("processado_em", "proxima_tentativa_em", "lease_ate");

ALTER TABLE "conciliacoes_pagamento" ADD COLUMN "ignorada_em" TIMESTAMP(3);
ALTER TABLE "conciliacoes_pagamento" ADD COLUMN "motivo_ignorar" TEXT;
ALTER TABLE "conciliacoes_pagamento" ADD COLUMN "admin_responsavel_id" UUID;
ALTER TABLE "conciliacoes_pagamento" ADD CONSTRAINT "conciliacoes_pagamento_admin_responsavel_id_fkey" FOREIGN KEY ("admin_responsavel_id") REFERENCES "usuarios"("id") ON DELETE SET NULL;

ALTER TABLE "denuncias" ADD COLUMN "resposta_usuario" TEXT;
ALTER TABLE "sinistros" ADD COLUMN "resposta_usuario" TEXT;
