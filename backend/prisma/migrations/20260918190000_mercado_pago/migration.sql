BEGIN;
ALTER TABLE usuarios ADD COLUMN mercado_pago_customer_id TEXT UNIQUE;
ALTER TABLE alugueis ADD COLUMN preco_dia_contratado DECIMAL(10,2);
-- Preserve historical amounts and deadlines. Legacy daily rate is reconstructed by service.
ALTER TABLE pagamentos ADD COLUMN tipo TEXT NOT NULL DEFAULT 'aluguel';
ALTER TABLE pagamentos ADD CONSTRAINT pagamentos_tipo_check CHECK(tipo IN ('aluguel','multa'));
DROP INDEX pagamentos_uma_cobranca_ativa;
DROP INDEX pagamentos_um_pago_por_aluguel;
CREATE UNIQUE INDEX pagamentos_uma_cobranca_ativa ON pagamentos(aluguel_id,tipo) WHERE status IN ('pendente','pago','cancelamento_pendente','estorno_pendente');
CREATE UNIQUE INDEX pagamentos_um_pago_por_aluguel ON pagamentos(aluguel_id,tipo) WHERE status='pago';
CREATE TABLE cartoes (
 id TEXT PRIMARY KEY,
 usuario_id UUID NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
 customer_id TEXT NOT NULL,
 gateway TEXT NOT NULL,
 payment_method_id TEXT NOT NULL,
 bandeira TEXT NOT NULL,
 ultimos_digitos CHAR(4) NOT NULL,
 validade VARCHAR(5) NOT NULL,
 padrao BOOLEAN NOT NULL DEFAULT false,
 criado_em TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 CONSTRAINT cartoes_digitos_check CHECK(ultimos_digitos ~ '^[0-9]{4}$')
);
CREATE INDEX cartoes_usuario_id_idx ON cartoes(usuario_id);
CREATE UNIQUE INDEX cartoes_um_padrao ON cartoes(usuario_id) WHERE padrao=true;
CREATE TABLE operacoes_pagamento (chave TEXT PRIMARY KEY, pagamento_id UUID NOT NULL REFERENCES pagamentos(id) ON DELETE RESTRICT, metodo TEXT NOT NULL);
COMMIT;
