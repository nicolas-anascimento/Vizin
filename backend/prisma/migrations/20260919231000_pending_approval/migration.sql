-- Pendências de usuários diferentes podem coexistir. A reserva exclusiva
-- começa na aprovação; o lock do objeto decide qual aprovação vence.
ALTER TABLE "alugueis" DROP CONSTRAINT "alugueis_sem_sobreposicao";
ALTER TABLE "alugueis" ADD CONSTRAINT "alugueis_sem_sobreposicao" EXCLUDE USING gist
  ("item_id" WITH =, daterange("data_inicio", "data_fim", '[]') WITH &&)
  WHERE ("status" IN ('aprovado','pago','retirado'));
