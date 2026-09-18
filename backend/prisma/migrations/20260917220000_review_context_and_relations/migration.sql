BEGIN;
ALTER TABLE avaliacoes ADD COLUMN contexto text NOT NULL DEFAULT 'usuario', ADD COLUMN item_id uuid;
UPDATE avaliacoes a SET contexto='objeto',item_id=r.item_id FROM alugueis r WHERE a.aluguel_id=r.id AND a.avaliador_id=r.locatario_id;
ALTER TABLE avaliacoes ADD CONSTRAINT avaliacoes_item_id_fkey FOREIGN KEY(item_id) REFERENCES itens(id) ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE conversas ADD CONSTRAINT conversas_objeto_id_fkey FOREIGN KEY(objeto_id) REFERENCES itens(id) ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE denuncias ADD CONSTRAINT denuncias_objeto_id_fkey FOREIGN KEY(objeto_id) REFERENCES itens(id) ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE denuncias ADD CONSTRAINT denuncias_aluguel_id_fkey FOREIGN KEY(aluguel_id) REFERENCES alugueis(id) ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE denuncias ADD CONSTRAINT denuncias_conversa_id_fkey FOREIGN KEY(conversa_id) REFERENCES conversas(id) ON DELETE SET NULL ON UPDATE CASCADE;
COMMIT;
