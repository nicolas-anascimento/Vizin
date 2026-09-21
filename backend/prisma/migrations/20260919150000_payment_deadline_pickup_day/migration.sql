-- The current contract allows payment until the end of the pickup date in Sao Paulo.
-- Keep terminal/historical rentals unchanged; extend or shorten only open approvals.
UPDATE alugueis
SET pagamento_ate = (((data_inicio + 1)::timestamp AT TIME ZONE 'America/Sao_Paulo') AT TIME ZONE 'UTC')::timestamp(3)
WHERE status = 'aprovado'
  AND pagamento_ate IS DISTINCT FROM (((data_inicio + 1)::timestamp AT TIME ZONE 'America/Sao_Paulo') AT TIME ZONE 'UTC')::timestamp(3);
