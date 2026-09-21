BEGIN;

-- A late receipt can enter reconciliation while another charge is pending.
-- Reconciliation rows are excluded from the unique active charge index.
DROP INDEX pagamentos_uma_cobranca_ativa;
CREATE UNIQUE INDEX pagamentos_uma_cobranca_ativa ON pagamentos(aluguel_id,tipo)
 WHERE status IN ('pendente','pago','cancelamento_pendente','estorno_pendente');

COMMIT;
