// Prepara banco isolado para verificar a migração administrativa sem afetar a base principal.
import "dotenv/config";
import pg from "pg";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
const source = new URL(process.env.DATABASE_URL!);
const name = `vizin_contract_test_upgrade_${Date.now()}`;
const administrator = new pg.Client({ connectionString: source.toString() });
await administrator.connect();
try { await administrator.query(`CREATE DATABASE "${name}"`); } finally { await administrator.end(); }
source.pathname = `/${name}`;
const client = new pg.Client({ connectionString: source.toString() });
await client.connect();
try {
  const root = path.resolve("prisma/migrations");
  const previous = readdirSync(root).filter(n => /^\d/.test(n) && n < "20260919170000_admin_audit").sort();
  for (const migration of previous) await client.query(readFileSync(path.join(root, migration, "migration.sql"), "utf8"));
  const id = "00000000-0000-4000-8000-000000000001";
  await client.query("INSERT INTO usuarios (id,nome,email,senha_hash,ativo) VALUES ($1,'Legado','admin-migration@test.local','hash',false)", [id]);
  await client.query(readFileSync(path.join(root, "20260919170000_admin_audit", "migration.sql"), "utf8"));
  const preserved = await client.query("SELECT id,nome FROM usuarios WHERE id=$1", [id]);
  if (preserved.rows.length !== 1 || preserved.rows[0].nome !== "Legado") throw new Error("Usuário legado não preservado");
  await client.query("INSERT INTO admin_auditoria (admin_id,acao,entidade,entidade_id) VALUES ($1,'teste','usuario',$1)", [id]);
  const indexes = await client.query("SELECT indexname FROM pg_indexes WHERE tablename='admin_auditoria'");
  for (const key of ["admin_id_idx", "entidade_entidade_id_idx", "criado_em_idx"]) if (!indexes.rows.some(row => row.indexname.endsWith(key))) throw new Error(`Índice ausente: ${key}`);
  const fk = await client.query("SELECT 1 FROM pg_constraint WHERE conname='admin_auditoria_admin_id_fkey'");
  if (!fk.rowCount) throw new Error("FK de administrador ausente");
  console.log(`Upgrade preservou dados, FK e 3 índices em ${name}`);
} finally { await client.end(); }
