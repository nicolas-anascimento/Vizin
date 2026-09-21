BEGIN;
ALTER TABLE verificacoes_identidade ADD CONSTRAINT verificacoes_identidade_revisor_id_fkey FOREIGN KEY(revisor_id) REFERENCES usuarios(id) ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE eventos_aluguel ADD CONSTRAINT eventos_aluguel_usuario_id_fkey FOREIGN KEY(usuario_id) REFERENCES usuarios(id) ON DELETE SET NULL ON UPDATE CASCADE;
CREATE INDEX avaliacoes_item_id_contexto_idx ON avaliacoes(item_id,contexto);
COMMIT;
