BEGIN;

ALTER TABLE cartoes ADD COLUMN exclusao_pendente BOOLEAN NOT NULL DEFAULT false;

-- Only active rows with the exact legacy UTC end-of-day deadline are adjusted.
-- Keep earlier 24-hour limits and all terminal/historical rentals untouched.
WITH approvals AS (
 SELECT aluguel_id, MIN(criado_em) AS aprovado_em
 FROM eventos_aluguel WHERE status = 'aprovado' GROUP BY aluguel_id
)
UPDATE alugueis AS a
SET pagamento_ate = LEAST(
 approvals.aprovado_em + interval '24 hours',
 ((a.data_inicio + 1)::timestamp AT TIME ZONE 'America/Sao_Paulo') AT TIME ZONE 'UTC'
)
FROM approvals
WHERE approvals.aluguel_id = a.id AND a.status = 'aprovado'
 AND (a.pagamento_ate = (a.data_inicio + interval '1 day')::timestamp
   OR a.pagamento_ate = (a.data_inicio + interval '1 day' - interval '1 millisecond')::timestamp);

ALTER TABLE pagamentos ADD COLUMN cartao_id TEXT;
CREATE INDEX pagamentos_cartao_id_status_idx ON pagamentos(cartao_id,status);

ALTER TABLE operacoes_pagamento
 ADD COLUMN fingerprint TEXT,
 ADD COLUMN tipo_operacao TEXT NOT NULL DEFAULT 'criar',
 ADD COLUMN estado TEXT NOT NULL DEFAULT 'pendente',
 ADD COLUMN lease_ate TIMESTAMP(3),
 ADD COLUMN tentativas INTEGER NOT NULL DEFAULT 0,
 ADD COLUMN atualizado_em TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
CREATE INDEX operacoes_pagamento_estado_lease_ate_idx ON operacoes_pagamento(estado,lease_ate);

CREATE TABLE operacoes_gateway (
 chave TEXT PRIMARY KEY,
 tipo TEXT NOT NULL,
 usuario_id UUID,
 fingerprint TEXT NOT NULL,
 estado TEXT NOT NULL DEFAULT 'pendente',
 referencia TEXT,
 lease_ate TIMESTAMP(3),
 tentativas INTEGER NOT NULL DEFAULT 0,
 dados JSONB NOT NULL DEFAULT '{}',
 criado_em TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 atualizado_em TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX operacoes_gateway_estado_lease_ate_idx ON operacoes_gateway(estado,lease_ate);
CREATE INDEX operacoes_gateway_usuario_id_tipo_idx ON operacoes_gateway(usuario_id,tipo);

-- NOT VALID preserves unknown legacy rows while rejecting invalid new writes.
ALTER TABLE pagamentos ADD CONSTRAINT pagamentos_status_check
 CHECK(status IS NULL OR status IN ('pendente','pago','falhou','cancelado','estornado','cancelamento_pendente','estorno_pendente','conciliacao','expirado')) NOT VALID;
ALTER TABLE pagamentos ADD CONSTRAINT pagamentos_metodo_check
 CHECK(metodo IS NULL OR metodo IN ('pix','cartao')) NOT VALID;
ALTER TABLE pagamentos ADD CONSTRAINT pagamentos_gateway_check
 CHECK(gateway IN ('demo','real','mercado_pago','simulado')) NOT VALID;
ALTER TABLE operacoes_pagamento ADD CONSTRAINT operacoes_pagamento_tipo_check
 CHECK(tipo_operacao IN ('criar','cancelar','estornar')) NOT VALID;
ALTER TABLE operacoes_pagamento ADD CONSTRAINT operacoes_pagamento_estado_check
 CHECK(estado IN ('pendente','processando','concluida','falhou')) NOT VALID;
ALTER TABLE operacoes_gateway ADD CONSTRAINT operacoes_gateway_tipo_check
 CHECK(tipo IN ('customer_criar','cartao_adicionar','cartao_excluir'));
ALTER TABLE operacoes_gateway ADD CONSTRAINT operacoes_gateway_estado_check
 CHECK(estado IN ('pendente','processando','concluida','falhou','conciliacao'));

DROP INDEX pagamentos_uma_cobranca_ativa;
CREATE UNIQUE INDEX pagamentos_uma_cobranca_ativa ON pagamentos(aluguel_id,tipo)
 WHERE status IN ('pendente','pago','cancelamento_pendente','estorno_pendente','conciliacao');

COMMIT;
