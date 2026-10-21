-- Alertas sem destinatário continuam globais; um destinatário torna o alerta privado.
ALTER TABLE "notificacoes_admin"
ADD COLUMN "destinatario_admin_id" UUID;

ALTER TABLE "notificacoes_admin"
ADD CONSTRAINT "notificacoes_admin_destinatario_admin_id_fkey"
FOREIGN KEY ("destinatario_admin_id") REFERENCES "usuarios"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

CREATE INDEX "notificacoes_admin_destinatario_admin_id_criado_em_idx"
ON "notificacoes_admin"("destinatario_admin_id", "criado_em");
