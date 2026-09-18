BEGIN;
-- Adapt existing rental messages to conversations without copying message contents.
INSERT INTO conversas(id,chave,objeto_id,criado_em,atualizado_em)
SELECT gen_random_uuid(), least(r.locador_id::text,r.locatario_id::text)||':'||greatest(r.locador_id::text,r.locatario_id::text)||':'||r.item_id::text, r.item_id, now(), now()
FROM alugueis r WHERE EXISTS(SELECT 1 FROM mensagens m WHERE m.aluguel_id=r.id)
GROUP BY r.locador_id,r.locatario_id,r.item_id ON CONFLICT(chave) DO NOTHING;
INSERT INTO participantes_conversa(conversa_id,usuario_id)
SELECT c.id,u.usuario_id FROM conversas c JOIN alugueis r ON c.chave=least(r.locador_id::text,r.locatario_id::text)||':'||greatest(r.locador_id::text,r.locatario_id::text)||':'||r.item_id::text
CROSS JOIN LATERAL (VALUES(r.locador_id),(r.locatario_id)) AS u(usuario_id) ON CONFLICT DO NOTHING;
UPDATE mensagens m SET conversa_id=c.id FROM alugueis r,conversas c WHERE m.aluguel_id=r.id AND m.conversa_id IS NULL AND c.chave=least(r.locador_id::text,r.locatario_id::text)||':'||greatest(r.locador_id::text,r.locatario_id::text)||':'||r.item_id::text;
COMMIT;
