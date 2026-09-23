// Exercita permissões, auditoria, moderação, conciliação e métricas administrativas contra banco isolado.
import assert from "node:assert/strict";
import test from "node:test";
import crypto from "node:crypto";
import type { AddressInfo } from "node:net";
const database = process.env.TEST_DATABASE_URL;
if (!database || !new URL(database).pathname.startsWith("/vizin_contract_test_")) throw new Error("TEST_DATABASE_URL isolado é obrigatório");
process.env.DATABASE_URL = database;
process.env.VIZIN_NO_LISTEN = "true";
process.env.NODE_ENV = "test";
process.env.PAYMENT_MODE = "demo";
process.env.JWT_KEY = "vizin-test-secret-with-at-least-32-characters";
function cpf() { let s = String(crypto.randomInt(100000000, 999999999)); for (const n of [9, 10]) s += String(([...s].reduce((a, d, i) => a + Number(d) * (n + 1 - i), 0) * 10 % 11) % 10); return s; }
test("admin: autorização, paginação, moderação, auditoria e conflitos", async t => {
  const { default: app } = await import("../../app.ts");
  const { default: prisma } = await import("../../app/config/database.ts");
  const { default: env } = await import("../../app/config/env.ts");
  const { default: jwt } = await import("jsonwebtoken");
  const server = app.listen(0, "127.0.0.1");
  await new Promise<void>(resolve => server.once("listening", resolve));
  t.after(async () => { await new Promise<void>(resolve => server.close(() => resolve())); await prisma.$disconnect(); });
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/admin`;
  const admin = await prisma.usuarios.create({ data: { nome: "Admin", email: `admin-${crypto.randomUUID()}@test.local`, cpf: cpf(), senha_hash: "x", tipo: "admin" } });
  const owner = await prisma.usuarios.create({ data: { nome: "Owner", email: `owner-${crypto.randomUUID()}@test.local`, cpf: cpf(), senha_hash: "x" } });
  const renter = await prisma.usuarios.create({ data: { nome: "Renter", email: `renter-${crypto.randomUUID()}@test.local`, cpf: cpf(), senha_hash: "x" } });
  const token = (u: typeof admin, version = u.token_version) => jwt.sign({ id: u.id, email: u.email, tipo: u.tipo, tokenVersion: version }, env.JWT_KEY);
  const adminToken = token(admin), ownerToken = token(owner);
  async function api(path: string, method = "GET", body?: unknown, bearer: string | null = adminToken) {
    const headers: Record<string, string> = {};
    if (bearer) headers.Authorization = `Bearer ${bearer}`;
    if (body !== undefined) headers["Content-Type"] = "application/json";
    const response = await fetch(base + path, { method, headers, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
    return { status: response.status, data: await response.json() as any };
  }
  const item = await prisma.itens.create({ data: { usuario_id: owner.id, titulo: "Objeto terceiro", preco_por_dia: 10, valor_mercado: 100 } });
  await t.test("segurança e envelope", async () => {
    assert.equal((await api("/usuarios", "GET", undefined, null)).status, 401);
    const denied = await api("/usuarios", "GET", undefined, ownerToken);
    assert.equal(denied.status, 403); assert.equal(denied.data.codigo, "admin_required");
    assert.equal((await api("/usuarios")).status, 200);
    await prisma.usuarios.update({ where: { id: admin.id }, data: { token_version: { increment: 1 } } });
    assert.equal((await api("/usuarios")).status, 401);
    await prisma.usuarios.update({ where: { id: admin.id }, data: { token_version: admin.token_version, ativo: false } });
    assert.equal((await api("/usuarios")).status, 401);
    await prisma.usuarios.update({ where: { id: admin.id }, data: { ativo: true } });
  });
  await t.test("detalhe administrativo de usuário: autorização, UUID e DTO seguro", async () => {
    assert.equal((await api(`/usuarios/${owner.id}`, "GET", undefined, null)).status, 401);
    assert.equal((await api(`/usuarios/${owner.id}`, "GET", undefined, ownerToken)).status, 403);
    const detail = await api(`/usuarios/${owner.id}`);
    assert.equal(detail.status, 200);
    assert.equal(detail.data.id, owner.id);
    assert.equal(typeof detail.data.estatisticas.objetos, "number");
    assert.equal(typeof detail.data.estatisticas.alugueis_como_locatario, "number");
    assert.equal(typeof detail.data.estatisticas.alugueis_como_proprietario, "number");
    assert.equal(typeof detail.data.estatisticas.denuncias_recebidas, "number");
    for (const field of ["cpf", "telefone", "senha", "senha_hash", "hash", "salt", "token", "token_version", "reset_token", "mercado_pago_customer_id", "saldo_carteira"]) {
      assert.equal(Object.hasOwn(detail.data, field), false, field);
    }
    assert.equal((await api("/usuarios/uuid-invalido")).status, 422);
    assert.equal((await api(`/usuarios/${crypto.randomUUID()}`)).status, 404);
  });
  await t.test("listagem de usuários filtra no servidor", async () => {
    const byName = await api("/usuarios?busca=Owner&status=ativo&page=1&limit=1");
    assert.equal(byName.status, 200);
    assert.equal(byName.data.dados.length, 1);
    assert.equal(byName.data.dados[0].id, owner.id);
    assert.equal((await api("/usuarios?status=desconhecido")).status, 422);
    assert.equal((await api("/usuarios?limit=0")).status, 422);
    assert.equal((await api("/usuarios?limit=1000")).data.dados.length <= 100, true);
  });
  await t.test("CSRF por cookie e Bearer inválido", async () => {
    const cookie = `token=${adminToken}`;
    const blocked = await fetch(`${base}/categorias`, { method: "POST", headers: { Cookie: cookie, "Content-Type": "application/json" }, body: JSON.stringify({ nome: "CSRF" }) });
    assert.equal(blocked.status, 403);
    assert.equal((await blocked.json() as any).codigo, "csrf_origin");
    const spoofed = await fetch(`${base}/categorias`, { method: "POST", headers: { Cookie: cookie, Authorization: "Bearer invalid", "Content-Type": "application/json" }, body: JSON.stringify({ nome: "CSRF" }) });
    assert.equal(spoofed.status, 401);
  });
  await t.test("objeto de terceiro, campos proibidos, ativo, inexistente e auditoria", async () => {
    assert.equal((await api(`/objetos/${item.id}`, "PATCH", { disponivel: false, motivo: "Irregular" }, ownerToken)).status, 403);
    assert.equal((await api(`/objetos/${item.id}`, "PATCH", { titulo: "Alterado", disponivel: false, motivo: "Irregular" })).status, 422);
    const changed = await api(`/objetos/${item.id}`, "PATCH", { disponivel: false, motivo: "Irregular" });
    assert.equal(changed.status, 200, JSON.stringify(changed.data));
    assert.equal((await prisma.itens.findUniqueOrThrow({ where: { id: item.id } })).titulo, "Objeto terceiro");
    const log = await prisma.admin_auditoria.findFirst({ where: { entidade: "objeto", entidade_id: item.id, acao: "ocultar" } });
    assert.equal(log?.admin_id, admin.id); assert.equal((log?.metadata as any).motivo, "Irregular");
    assert.equal((await api(`/objetos/${crypto.randomUUID()}`, "DELETE", { motivo: "Teste" })).status, 404);
    const rental = await prisma.alugueis.create({ data: { item_id: item.id, locador_id: owner.id, locatario_id: renter.id, data_inicio: new Date("2027-01-01"), data_fim: new Date("2027-01-02"), valor_total: 10, status: "pago" } });
    assert.equal((await api(`/objetos/${item.id}`, "DELETE", { motivo: "Teste" })).status, 409);
    assert.equal(await prisma.admin_auditoria.count({ where: { entidade: "objeto", entidade_id: item.id, acao: "arquivar" } }), 0);
    await prisma.alugueis.update({ where: { id: rental.id }, data: { status: "finalizado" } });
    assert.equal((await api(`/objetos/${item.id}`, "DELETE", { motivo: "Teste" })).status, 200);
    assert.equal((await prisma.itens.findUniqueOrThrow({ where: { id: item.id } })).arquivado, true);
  });
  await t.test("paginação: total, segunda página e limites", async () => {
    await prisma.itens.createMany({ data: Array.from({ length: 105 }, (_, i) => ({ usuario_id: owner.id, titulo: `Lote ${i}`, preco_por_dia: 10, valor_mercado: 100 })) });
    const first = await api("/objetos?page=1&limit=20"), second = await api("/objetos?page=2&limit=20");
    assert.equal(first.status, 200); assert.equal(first.data.data.length, 20); assert.equal(second.data.data.length, 20);
    assert.equal(first.data.total, second.data.total); assert.notEqual(first.data.data[0].id, second.data.data[0].id);
    assert.equal(["ativo", "arquivado"].includes(first.data.data[0].status), true);
    assert.equal(typeof first.data.data[0].emLocacao, "boolean");
    assert.equal(typeof first.data.data[0].solicitacaoPendente, "boolean");
    const searched = await api("/objetos?busca=Objeto%20terceiro&page=1&limit=20");
    assert.equal(searched.data.data.some((row: any) => row.id === item.id), true);
    assert.equal((await api("/objetos?limit=100000")).data.limit, 100);
    assert.equal((await api("/objetos?limit=0")).status, 422);
    assert.equal((await api("/objetos?page=-1")).status,422);
    assert.equal((await api("/objetos?status=abc")).status,422);
    assert.equal((await api("/alugueis?status=abc")).status,422);
    assert.equal((await api("/metricas?dataInicio=2026-02-30")).status,422);
    assert.equal((await api("/metricas?dataFim=abc")).status,422);
    assert.equal((await api("/objetos?limit=999999")).data.limit,100);
    assert.equal((await api("/objetos?page=2&limit=100")).data.data.length > 0, true);
    const rents = await api("/alugueis?page=1&limit=1"); assert.equal(rents.status, 200); assert.equal(rents.data.data.length, 1);
    assert.equal(typeof first.data.data[0].preco_por_dia,"number");assert.equal(typeof rents.data.data[0].valor_total,"number");
    assert.equal((await api("/alugueis?status=finalizado")).data.total >= 1, true);
    const metrics = await api("/metricas?dataInicio=2026-01-01&dataFim=2028-12-31");
    assert.equal(metrics.status, 200); assert.equal(metrics.data.periodo.timezone, "America/Sao_Paulo");
    assert.equal(typeof metrics.data.pagamentos.aluguel.valor, "number");
    for(const field of ["aprovados","multas","estornosPendentes","estornosConcluidos","cancelamentosPendentes","cancelamentosConcluidos"])assert.equal(typeof metrics.data.pagamentos[field].valor,"number");
    assert.equal(typeof metrics.data.pagamentos.taxaPlataformaRecebida,"number");
  });
  await t.test("status do usuário e obrigação", async () => {
    const activeItem = await prisma.itens.create({ data: { usuario_id: owner.id, titulo: "Em locação", preco_por_dia: 10, valor_mercado: 100 } });
    const rental = await prisma.alugueis.create({ data: { item_id: activeItem.id, locador_id: owner.id, locatario_id: renter.id, data_inicio: new Date("2027-02-01"), data_fim: new Date("2027-02-02"), valor_total: 10, status: "pago" } });
    const blocked = await api(`/usuarios/${owner.id}/status`, "PATCH", { ativo: false }); assert.equal(blocked.status, 409); assert.equal(blocked.data.codigo, "usuario_com_obrigacoes_ativas");
    await prisma.alugueis.update({ where: { id: rental.id }, data: { status: "finalizado" } });
    assert.equal((await api(`/usuarios/${owner.id}/status`, "PATCH", { ativo: false })).status, 200);
    assert.equal((await api(`/usuarios/${owner.id}/status`, "PATCH", { ativo: true })).status, 200);
    await prisma.usuarios.update({ where: { id: owner.id }, data: { ativo: false, cpf: null } });
    assert.equal((await api(`/usuarios/${owner.id}/status`, "PATCH", { ativo: true })).data.codigo, "cpf_invalido_reativacao");
    const repaired = cpf();
    assert.equal((await api(`/usuarios/${owner.id}/cpf`, "PATCH", { cpf: repaired })).status, 200);
    assert.equal((await api(`/usuarios/${owner.id}/status`, "PATCH", { ativo: true })).status, 200);
    assert.equal(await prisma.admin_auditoria.count({ where: { entidade: "usuario", entidade_id: owner.id, acao: "corrigir_cpf" } }), 1);
  });
  // Confirma que decisões administrativas repetidas ou simultâneas não se sobrepõem.
  await t.test("filas, decisões concorrentes e idempotência", async () => {
    const cases = await prisma.suportes.createMany({ data: Array.from({ length: 105 }, (_, i) => ({ usuario_id: renter.id, assunto: `Caso ${i}`, mensagem: "Ajuda", protocolo: `ADM-${crypto.randomUUID()}` })) });
    assert.equal(cases.count, 105);
    const list = await api("/suporte?page=2&limit=100"); assert.ok(list.data.data.length >= 5); assert.ok(list.data.total >= 105);
    const id = list.data.data[0].id;
    const decision = await api(`/suporte/${id}`, "PATCH", { status: "respondido", status_atual: "aberto", resposta: "Resolvido" }); assert.equal(decision.status, 200);
    const stale = await api(`/suporte/${id}`, "PATCH", { status: "fechado", status_atual: "aberto", resposta: "Outra decisão" }); assert.equal(stale.status, 409); assert.equal(stale.data.codigo, "decisao_concorrente");
    const notices = await prisma.notificacoes.count({ where: { tipo: "suporte", contexto: { path: ["recursoId"], equals: id } } });
    assert.equal((await api(`/suporte/${id}`, "PATCH", { status: "respondido", resposta: "Resolvido" })).status, 200);
    assert.equal(await prisma.notificacoes.count({ where: { tipo: "suporte", contexto: { path: ["recursoId"], equals: id } } }), notices);
  });
  await t.test("identidade: aprovação, rejeição e decisão única", async () => {
    const pending = await prisma.verificacoes_identidade.create({ data: { usuario_id: renter.id, documentos: {}, status: "pendente" } });
    assert.equal((await api("/verificacoes?page=1&limit=1&status=pendente")).status, 200);
    assert.equal((await api(`/verificacoes/${pending.id}`, "PATCH", { status: "aprovado" })).status, 200);
    assert.equal((await api(`/verificacoes/${pending.id}`, "PATCH", { status: "rejeitado", motivo: "Outra decisão" })).status, 409);
    assert.equal(await prisma.admin_auditoria.count({ where: { entidade: "verificacao", entidade_id: pending.id } }), 1);
    const rejected = await prisma.verificacoes_identidade.create({ data: { usuario_id: owner.id, documentos: {}, status: "pendente" } });
    assert.equal((await api(`/verificacoes/${rejected.id}`, "PATCH", { status: "rejeitado", motivo: "Ilegível" })).status, 200);
  });
  await t.test("denúncia, sinistro e avaliação", async () => {
    const report = await prisma.denuncias.create({ data: { usuario_id: renter.id, denunciado_id: owner.id, objeto_id: item.id, motivo: "fraude", mensagem: "Teste", protocolo: `ADM-${crypto.randomUUID()}` } });
    assert.equal((await api("/denuncias?page=1&limit=1")).status, 200);
    assert.equal((await api(`/denuncias/${report.id}`, "PATCH", { status: "procedente", status_atual: "aberta", notas: "Confirmada",resposta_usuario:"Denúncia analisada" })).status, 200);
    const userReport=await fetch(base.replace("/api/admin","/api/suporte/me"),{headers:{Authorization:`Bearer ${token(renter)}`}});const reports=await userReport.json() as any;
    assert.equal(reports.denuncias.find((row:any)=>row.id===report.id)?.notas,undefined);
    assert.equal(reports.denuncias.find((row:any)=>row.id===report.id)?.resposta_usuario,"Denúncia analisada");
    assert.ok(!JSON.stringify(reports).includes("Confirmada"));
    assert.equal((await api(`/denuncias/${report.id}`, "PATCH", { status: "improcedente", status_atual: "aberta", notas: "Outra" })).data.codigo, "decisao_concorrente");
    const claimItem = await prisma.itens.create({ data: { usuario_id: owner.id, titulo: "Sinistro", preco_por_dia: 10, valor_mercado: 100 } });
    const rental = await prisma.alugueis.create({ data: { item_id: claimItem.id, locador_id: owner.id, locatario_id: renter.id, data_inicio: new Date("2027-04-01"), data_fim: new Date("2027-04-02"), valor_total: 10, status: "finalizado" } });
    const claim = await prisma.sinistros.create({ data: { aluguel_id: rental.id, reportador_id: renter.id, descricao: "Dano", valor_solicitado: 12.5 } });
    assert.equal((await api("/sinistros?page=1&limit=1")).status, 200);
    const decidedClaim = await api(`/sinistros/${claim.id}`, "PATCH", { status: "em_analise", notas_analise: "Investigando",resposta_usuario:"Caso em análise" });
    assert.equal(decidedClaim.status, 200);
    assert.equal(decidedClaim.data.valor_solicitado, 12.5);
    const userClaim=await fetch(base.replace("/api/admin","/api/suporte/me"),{headers:{Authorization:`Bearer ${token(renter)}`}});assert.ok(!JSON.stringify(await userClaim.json()).includes("Investigando"));
    assert.equal(await prisma.admin_auditoria.count({ where: { entidade: "sinistro", entidade_id: claim.id } }), 1);
    const review = await prisma.avaliacoes.create({ data: { aluguel_id: rental.id, avaliador_id: renter.id, avaliado_id: owner.id, nota: 4 } });
    assert.equal((await api("/avaliacoes?page=1&limit=1")).status, 200);
    assert.equal((await api(`/avaliacoes/${review.id}`, "DELETE")).status, 200);
    assert.equal(await prisma.admin_auditoria.count({ where: { entidade: "avaliacao", entidade_id: review.id } }), 1);
  });
  await t.test("categorias: slug, edição e uso", async () => {
    assert.equal((await api("/categorias")).status, 200);
    const name = `Nova categoria ${crypto.randomUUID().slice(0, 8)}`;
    const created = await api("/categorias", "POST", { nome: name }); assert.equal(created.status, 201);
    assert.equal((await api("/categorias", "POST", { nome: name.toUpperCase() })).status, 409);
    assert.equal((await api(`/categorias/${created.data.id}`, "PATCH", { nome: `${name} editada` })).status, 200);
    const used = await prisma.itens.create({ data: { usuario_id: owner.id, categoria_id: created.data.id, titulo: "Em uso", preco_por_dia: 10, valor_mercado: 100 } });
    assert.equal((await api(`/categorias/${created.data.id}`, "DELETE")).data.codigo, "categoria_em_uso");
    await prisma.itens.update({ where: { id: used.id }, data: { categoria_id: null } });
    assert.equal((await api(`/categorias/${created.data.id}`, "DELETE")).status, 200);
    assert.equal(await prisma.admin_auditoria.count({ where: { entidade: "categoria", entidade_id: created.data.id } }), 3);
  });
  await t.test("conciliação: detalhe seguro, motivo e idempotência", async () => {
    const target = await prisma.itens.create({ data: { usuario_id: owner.id, titulo: "Financeiro", preco_por_dia: 10, valor_mercado: 100 } });
    const rental = await prisma.alugueis.create({ data: { item_id: target.id, locador_id: owner.id, locatario_id: renter.id, data_inicio: new Date("2027-05-01"), data_fim: new Date("2027-05-02"), valor_total: 10, status: "finalizado" } });
    const payment = await prisma.pagamentos.create({ data: { aluguel_id: rental.id, valor: 10, metodo: "pix", status: "pendente", gateway: "mercado_pago", tipo: "aluguel", dados: { token_cartao: "secret" } } });
    const reconciliation = await prisma.conciliacoes_pagamento.create({ data: { pagamento_id: payment.id, chave: `admin-${crypto.randomUUID()}`, motivo: "Evento divergente", dados: { token: "secret" } } });
    const detail = await api(`/conciliacoes/${reconciliation.id}`); assert.equal(detail.status, 200); assert.equal(detail.data.pagamento.gateway, "mercado_pago");
    assert.equal(JSON.stringify(detail.data).includes("secret"), false);
    assert.equal((await api(`/conciliacoes/${reconciliation.id}/ignorar`, "POST", {})).status, 422);
    assert.equal((await api(`/conciliacoes/${reconciliation.id}/ignorar`, "POST", { motivo: "Duplicado confirmado" })).status, 200);
    const decided=await api(`/conciliacoes/${reconciliation.id}`);assert.equal(decided.data.admin_responsavel,admin.id);assert.equal(decided.data.motivo_ignorar,"Duplicado confirmado");assert.ok(decided.data.ignorada_em);assert.equal(decided.data.moeda,"BRL");
    assert.equal((await api(`/conciliacoes/${reconciliation.id}/ignorar`, "POST", { motivo: "Duplicado confirmado" })).status, 200);
    assert.equal((await prisma.pagamentos.findUniqueOrThrow({ where: { id: payment.id } })).status, "pendente");
    assert.equal(await prisma.admin_auditoria.count({ where: { entidade: "conciliacao", entidade_id: reconciliation.id } }), 1);
    assert.equal(JSON.stringify((await api(`/pagamentos/${payment.id}`)).data).includes("secret"), false);
  });
  await t.test("estorno administrativo auditado", async () => {
    const target = await prisma.itens.create({ data: { usuario_id: owner.id, titulo: "Estorno", preco_por_dia: 10, valor_mercado: 100 } });
    const rental = await prisma.alugueis.create({ data: { item_id: target.id, locador_id: owner.id, locatario_id: renter.id, data_inicio: new Date("2027-06-01"), data_fim: new Date("2027-06-02"), valor_total: 10, status: "pago" } });
    const payment = await prisma.pagamentos.create({ data: { aluguel_id: rental.id, valor: 10, metodo: "pix", status: "pago", gateway: "demo", tipo: "aluguel" } });
    const response = await api(`/pagamentos/${payment.id}/estornar`, "POST", {});
    assert.ok([200, 202].includes(response.status), JSON.stringify(response.data));
    assert.equal(await prisma.admin_auditoria.count({ where: { entidade: "pagamento", entidade_id: payment.id, acao: "solicitar_estorno" } }), 1);
    assert.equal((await api(`/pagamentos/${payment.id}/estornar`, "POST", {})).status, 200);
    assert.equal(await prisma.admin_auditoria.count({ where: { entidade: "pagamento", entidade_id: payment.id, acao: "solicitar_estorno" } }), 1);
  });
  await t.test("conciliação e dados financeiros", async () => {
    assert.equal((await api("/conciliacoes")).status, 200);
    assert.equal((await api("/webhooks-pendentes")).status, 200);
    assert.equal((await api(`/conciliacoes/${crypto.randomUUID()}`)).status, 404);
    assert.equal((await api(`/pagamentos/${crypto.randomUUID()}`)).status, 404);
    assert.equal((await api("/pagamentos/fake/pagar", "POST", {})).status, 404);
  });
  await t.test("pagamentos administrativos: busca, relações seguras e estatísticas", async () => {
    const list = await api("/pagamentos?busca=Renter&page=1&limit=100");
    assert.equal(list.status, 200);
    assert.equal(Array.isArray(list.data.data), true);
    if (list.data.data.length) {
      assert.equal(list.data.data[0].usuario.nome, "Renter");
      assert.equal(typeof list.data.data[0].produto.titulo, "string");
      const serialized = JSON.stringify(list.data.data[0]);
      for (const secret of ["token_cartao", "access_token", "card_number", "cvv", "senha_hash", "dados"]) assert.equal(serialized.includes(secret), false, secret);
    }
    assert.equal((await api("/pagamentos?status=desconhecido")).status, 422);
    assert.equal((await api("/pagamentos?limit=0")).status, 422);
    const stats = await api("/pagamentos/estatisticas");
    assert.equal(stats.status, 200);
    assert.equal(typeof stats.data.receita_total, "number");
    assert.equal(typeof stats.data.pagamentos_pendentes, "number");
    assert.equal(typeof stats.data.transacoes_falhadas, "number");
    assert.equal(stats.data.receita_mensal.length, 6);
    assert.equal(stats.data.timezone, "America/Sao_Paulo");
    assert.equal(stats.data.receita_base, "pago_em");
    assert.equal((await api("/pagamentos/estatisticas", "GET", undefined, null)).status, 401);
    assert.equal((await api("/pagamentos/estatisticas", "GET", undefined, ownerToken)).status, 403);
  });
  await t.test("métricas financeiras seguem o pagamento no período civil", async () => {
    const range = "/metricas?dataInicio=2041-03-04&dataFim=2041-03-04";
    const before = (await api(range)).data;
    const item = await prisma.itens.create({ data: { usuario_id: owner.id, titulo: "Métrica", preco_por_dia: 70, valor_mercado: 100 } });
    const rental = await prisma.alugueis.create({ data: { item_id: item.id, locador_id: owner.id, locatario_id: renter.id, data_inicio: new Date("2041-03-04"), data_fim: new Date("2041-03-05"), valor_total: 70, taxa_plataforma: 7.25, status: "pago" } });
    await prisma.pagamentos.create({ data: { aluguel_id: rental.id, valor: 77.25, metodo: "pix", status: "pago", gateway: "demo", tipo: "aluguel", pago_em: new Date("2041-03-04T15:00:00Z") } });
    const after = (await api(range)).data;
    assert.equal(after.pagamentos.aprovados.quantidade, before.pagamentos.aprovados.quantidade + 1);
    assert.equal(after.pagamentos.aprovados.valor, before.pagamentos.aprovados.valor + 77.25);
    assert.equal(after.pagamentos.taxaPlataformaRecebida, before.pagamentos.taxaPlataformaRecebida + 7.25);
    assert.equal((await api("/metricas?dataInicio=2041-03-05&dataFim=2041-03-05")).data.pagamentos.aprovados.valor, 0);
  });
});
