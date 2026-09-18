import 'dotenv/config';
import pg from 'pg';
const client=new pg.Client({connectionString:process.env.DATABASE_URL});
await client.connect();
try {
 await client.query('BEGIN READ ONLY');
 const checks:Record<string,string>={
 usuarios:"SELECT count(*)::int total FROM usuarios",
 cpf_colisoes:"SELECT count(*)::int total FROM (SELECT regexp_replace(cpf,'[^0-9]','','g') c FROM usuarios WHERE cpf IS NOT NULL GROUP BY 1 HAVING count(*)>1) q",
 cpf_incompletos:"SELECT count(*)::int total FROM usuarios WHERE ativo AND (cpf IS NULL OR length(regexp_replace(cpf,'[^0-9]','','g'))<>11)",
 reservas_sobrepostas:"SELECT count(*)::int total FROM alugueis a JOIN alugueis b ON a.id<b.id AND a.item_id=b.item_id AND daterange(a.data_inicio,a.data_fim,'[]') && daterange(b.data_inicio,b.data_fim,'[]') WHERE a.status IN ('pendente','aprovado','pago','retirado','aguardando_devolucao') AND b.status IN ('pendente','aprovado','pago','retirado','aguardando_devolucao')",
 pagamentos_ativos_duplicados:"SELECT count(*)::int total FROM (SELECT aluguel_id FROM pagamentos WHERE status IN ('pendente','pago','cancelamento_pendente','estorno_pendente') GROUP BY aluguel_id HAVING count(*)>1) q",
 pagamentos_incompativeis:"SELECT count(*)::int total FROM pagamentos p JOIN alugueis a ON a.id=p.aluguel_id WHERE p.valor<>a.valor_total OR (p.status='pago' AND a.status NOT IN ('pago','retirado','devolvido','finalizado'))",
 datas_invalidas:"SELECT count(*)::int total FROM alugueis WHERE data_fim<data_inicio",
 principais_fotos_duplicadas:"SELECT count(*)::int total FROM (SELECT item_id FROM fotos_item WHERE principal GROUP BY item_id HAVING count(*)>1) q",
 principais_enderecos_duplicados:"SELECT count(*)::int total FROM (SELECT usuario_id FROM enderecos WHERE principal GROUP BY usuario_id HAVING count(*)>1) q",
 retiradas_duplicadas:"SELECT count(*)::int total FROM (SELECT aluguel_id,usuario_id FROM retiradas GROUP BY 1,2 HAVING count(*)>1) q",
 avaliacoes_duplicadas:"SELECT count(*)::int total FROM (SELECT aluguel_id,avaliador_id FROM avaliacoes GROUP BY 1,2 HAVING count(*)>1) q",
 fotos_legadas_invalidas:"SELECT count(*)::int total FROM (SELECT i.id FROM itens i LEFT JOIN fotos_item f ON f.item_id=i.id GROUP BY i.id HAVING count(f.id) NOT BETWEEN 1 AND 5) q",
 };
 for(const [name,sql]of Object.entries(checks))console.log(name,(await client.query(sql)).rows[0].total);
 const {cpf}=await import('../src/app/utils/validation.ts');
 const users=await client.query('SELECT cpf FROM usuarios WHERE ativo');let invalid=0;for(const u of users.rows){try{cpf(u.cpf);}catch{invalid++;}}console.log('cpf_ativos_invalidos',invalid);
 await client.query('ROLLBACK');
} finally {await client.end();}
