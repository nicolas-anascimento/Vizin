BEGIN;
ALTER TABLE pagamentos ALTER COLUMN gateway SET DEFAULT 'real';
ALTER TABLE webhook_eventos ADD COLUMN payload JSONB, ADD COLUMN processado_em TIMESTAMP(3);
-- Historical IDs represent events already applied, not an inbox to replay.
UPDATE webhook_eventos SET processado_em=criado_em WHERE payload IS NULL;
CREATE INDEX webhook_eventos_processado_em_criado_em_idx ON webhook_eventos(processado_em,criado_em);
CREATE TABLE conciliacoes_pagamento (
 id UUID PRIMARY KEY,
 pagamento_id UUID NOT NULL REFERENCES pagamentos(id) ON DELETE RESTRICT,
 chave TEXT NOT NULL UNIQUE,
 motivo TEXT NOT NULL,
 status TEXT NOT NULL DEFAULT 'aberta',
 dados JSONB NOT NULL DEFAULT '{}',
 criado_em TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX conciliacoes_pagamento_status_criado_em_idx ON conciliacoes_pagamento(status,criado_em);
-- Do not erase or automatically relabel historical financial records.
CREATE UNIQUE INDEX pagamentos_uma_cobranca_ativa ON pagamentos(aluguel_id)
 WHERE status IN ('pendente','pago','cancelamento_pendente','estorno_pendente');
COMMIT;
