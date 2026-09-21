// Verifica o contrato esperado pelo frontend em solicitações, fotos, bloqueios, multa e notificações.
import assert from "node:assert/strict";
import test from "node:test";
import crypto from "node:crypto";
import type { AddressInfo } from "node:net";

const database = process.env.TEST_DATABASE_URL;
if (!database || !new URL(database).pathname.startsWith("/vizin_contract_test_")) throw new Error("TEST_DATABASE_URL isolado é obrigatório");
process.env.DATABASE_URL = database;
process.env.VIZIN_NO_LISTEN = "true";
process.env.NODE_ENV = "dev";
process.env.PAYMENT_MODE = "demo";
process.env.JWT_KEY = "vizin-test-secret-with-at-least-32-characters";

const dateText = (d: Date) => d.toISOString().slice(0, 10);
const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+ip1sAAAAASUVORK5CYII=", "base64");
function makeCpf() { let value = String(crypto.randomInt(100000000, 999999999)); for (const n of [9, 10]) value += String(([...value].reduce((sum, digit, index) => sum + Number(digit) * (n + 1 - index), 0) * 10 % 11) % 10); return value; }

test("contrato do frontend: solicitações, bloqueios, fotos, multa e notificações", async t => {
  const { default: app } = await import("../../app.ts");
  const { default: prisma } = await import("../../app/config/database.ts");
  const { default: env } = await import("../../app/config/env.ts");
  const { default: jwt } = await import("jsonwebtoken");
  const { businessDate } = await import("../../app/utils/dates.ts");
  const server = app.listen(0, "127.0.0.1");
  await new Promise<void>(resolve => server.once("listening", resolve));
  t.after(async () => { await new Promise<void>(resolve => server.close(() => resolve())); await prisma.$disconnect(); });
  const origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  const base = `${origin}/api`;
  const makeUser = (name: string, tipo: "usuario" | "admin" = "usuario") => prisma.usuarios.create({ data: { nome: name, email: `${crypto.randomUUID()}@test.local`, cpf: makeCpf(), senha_hash: "x", tipo } });
  const [owner, renter, other, admin] = await Promise.all([makeUser("Owner"), makeUser("Renter"), makeUser("Other"), makeUser("Admin", "admin")]);
  const token = (user: typeof owner) => jwt.sign({ id: user.id, tipo: user.tipo, tokenVersion: user.token_version }, env.JWT_KEY);
  async function request(path: string, user: typeof owner | null = renter, method = "GET", body?: unknown, extraHeaders: Record<string, string> = {}) {
    const headers: Record<string, string> = { Origin: "http://localhost:8080", ...extraHeaders };
    if (user) headers.Authorization = `Bearer ${token(user)}`;
    if (body !== undefined && !(body instanceof FormData)) headers["Content-Type"] = "application/json";
    const response = await fetch(base + path, { method, headers, ...(body === undefined ? {} : { body: body instanceof FormData ? body : JSON.stringify(body) }) });
    return { status: response.status, data: await response.json() as any, headers: response.headers };
  }
  const item = await prisma.itens.create({ data: { usuario_id: owner.id, titulo: "Furadeira", preco_por_dia: 35, valor_mercado: 300 } });
  const period = { produto_id: item.id, data_retirada: dateText(businessDate(new Date(Date.now() + 86400000))), data_devolucao: dateText(businessDate(new Date(Date.now() + 3 * 86400000))) };

  await t.test("criação, UUID, preço do servidor, papéis e pendência duplicada", async () => {
    assert.equal((await request("/usuarios/me")).data.id, renter.id);
    assert.equal((await request("/solicitacoes", owner, "POST", period)).status, 409);
    const first = await request("/solicitacoes", renter, "POST", { ...period, total: 1, taxa_servico: 0 });
    assert.equal(first.status, 201, JSON.stringify(first.data));
    assert.equal(first.data.produto.id, item.id);
    assert.equal(first.data.proprietario.id, owner.id);
    assert.equal(first.data.solicitante.id, renter.id);
    assert.equal(first.data.subtotal, 70);
    assert.equal(first.data.taxa_servico, 3.5);
    assert.equal(first.data.total, 73.5);
    assert.equal((await request("/solicitacoes", renter, "POST", period)).data.codigo, "solicitacao_duplicada");
    assert.equal((await request("/solicitacoes?papel=abc")).status, 422);
    assert.ok((await request("/solicitacoes?papel=locatario")).data.some((r: any) => r.id === first.data.id));
    assert.ok((await request("/solicitacoes?papel=proprietario", owner)).data.some((r: any) => r.id === first.data.id));
    const second = await request("/solicitacoes", other, "POST", period);
    assert.equal(second.status, 201);
    assert.equal((await request(`/solicitacoes/${first.data.id}`, other)).status, 403);
    assert.equal((await request(`/solicitacoes/${first.data.id}`, other, "PATCH", { status: "aprovado" })).status, 403);
    const approved = await request(`/solicitacoes/${first.data.id}`, owner, "PATCH", { status: "aprovado" });
    assert.equal(approved.status, 200, JSON.stringify(approved.data));
    assert.equal((await prisma.alugueis.findUniqueOrThrow({ where: { id: second.data.id } })).status, "recusado");
    assert.equal((await request(`/objetos/${item.id}/disponibilidade`)).data.periodosReservados[0].status, "aprovado");
    assert.ok(await prisma.notificacoes.count({ where: { usuario_id: other.id, tipo: "aluguel_rejeitado" } }));
  });

  // Duas aprovações concorrentes devem produzir apenas uma reserva válida no período.
  await t.test("aprovações simultâneas incompatíveis têm uma vencedora", async () => {
    const target = await prisma.itens.create({ data: { usuario_id: owner.id, titulo: "Concorrência", preco_por_dia: 10, valor_mercado: 100 } });
    const payload = { ...period, produto_id: target.id };
    const a = await request("/solicitacoes", renter, "POST", payload);
    const b = await request("/solicitacoes", other, "POST", payload);
    assert.equal(a.status, 201); assert.equal(b.status, 201);
    const results = await Promise.all([request(`/solicitacoes/${a.data.id}`, owner, "PATCH", { status: "aprovado" }), request(`/solicitacoes/${b.data.id}`, owner, "PATCH", { status: "aprovado" })]);
    assert.deepEqual(results.map(r => r.status).sort(), [200, 409]);
    const states = await prisma.alugueis.findMany({ where: { id: { in: [a.data.id, b.data.id] } }, select: { status: true } });
    assert.deepEqual(states.map(r => r.status).sort(), ["aprovado", "recusado"]);
  });

  await t.test("cancelamento registra ator e não inventa estorno", async () => {
    const target = await prisma.itens.create({ data: { usuario_id: owner.id, titulo: "Cancelamento", preco_por_dia: 10, valor_mercado: 100 } });
    const created = await request("/solicitacoes", renter, "POST", { ...period, produto_id: target.id });
    assert.equal((await request(`/solicitacoes/${created.data.id}/cancelamento`, renter, "POST", {})).status, 200);
    const row = await prisma.alugueis.findUniqueOrThrow({ where: { id: created.data.id } });
    assert.equal(row.status, "cancelado"); assert.equal(row.cancelado_por, renter.id);
    assert.equal((await request(`/solicitacoes/${created.data.id}/cancelamento`, renter, "POST", {})).status, 200);
    assert.equal(await prisma.eventos_aluguel.count({ where: { aluguel_id: created.data.id, status: "cancelado" } }), 1);
    const paidItem = await prisma.itens.create({ data: { usuario_id: owner.id, titulo: "Cancelamento pago", preco_por_dia: 10, valor_mercado: 100 } });
    const paidRental = await prisma.alugueis.create({ data: { item_id: paidItem.id, locador_id: owner.id, locatario_id: renter.id, data_inicio: businessDate(new Date(Date.now() + 86400000)), data_fim: businessDate(new Date(Date.now() + 86400000)), valor_total: 10, status: "pago" } });
    const paidPayment = await prisma.pagamentos.create({ data: { aluguel_id: paidRental.id, tipo: "aluguel", valor: 11, metodo: "pix", status: "pago", gateway: "demo" } });
    assert.equal((await request(`/solicitacoes/${paidRental.id}/cancelamento`, renter, "POST", {})).status, 200);
    assert.equal((await prisma.pagamentos.findUniqueOrThrow({ where: { id: paidPayment.id } })).status, "estornado");
    assert.equal(await prisma.notificacoes.count({ where: { tipo: "aluguel_cancelado", chave: { startsWith: `${paidRental.id}:cancelamento:` } } }), 2);
  });

  await t.test("devolução atrasada e multa pendente bloqueiam no servidor; contestação suspende", async () => {
    const target = await prisma.itens.create({ data: { usuario_id: owner.id, titulo: "Bloqueio", preco_por_dia: 10, valor_mercado: 100 } });
    const old = new Date(businessDate().getTime() - 2 * 86400000);
    const late = await prisma.alugueis.create({ data: { item_id: target.id, locador_id: owner.id, locatario_id: renter.id, data_inicio: old, data_fim: old, valor_total: 10, status: "retirado" } });
    assert.equal((await request("/usuarios/me/bloqueio")).data.motivo, "devolucao_pendente");
    const newItem = await prisma.itens.create({ data: { usuario_id: owner.id, titulo: "Novo", preco_por_dia: 10, valor_mercado: 100 } });
    assert.equal((await request("/solicitacoes", renter, "POST", { ...period, produto_id: newItem.id })).data.codigo, "usuario_com_devolucao_pendente");
    await prisma.alugueis.update({ where: { id: late.id }, data: { status: "devolvido" } });
    await prisma.multas_aluguel.create({ data: { aluguel_id: late.id, dias_atraso: 2, valor_dia: 2, valor_total: 4, valor_plataforma: 0.4, valor_proprietario: 3.6 } });
    assert.equal((await request("/usuarios/me/bloqueio")).data.motivo, "multa_pendente");
    assert.equal((await request("/solicitacoes", renter, "POST", { ...period, produto_id: newItem.id })).data.codigo, "usuario_com_multa_pendente");
    const dispute = await request(`/solicitacoes/${late.id}/multa/contestacao`, renter, "POST", { descricao: "Valor indevido" });
    assert.equal(dispute.status, 201, JSON.stringify(dispute.data));
    assert.equal((await request(`/solicitacoes/${late.id}/multa`)).data.status, "contestada");
    assert.equal((await request(`/solicitacoes/${late.id}/multa/pagamentos`, renter, "POST", { metodo: "pix" }, { "Idempotency-Key": crypto.randomUUID() })).data.codigo, "multa_contestada");
    assert.equal((await request("/usuarios/me/bloqueio")).data, null);
    assert.equal((await request(`/admin/multas/${late.id}`, admin, "PATCH", { status: "pendente", motivo: "Revisão concluída" })).status, 200);
    assert.equal((await request("/usuarios/me/bloqueio")).data.motivo, "multa_pendente");
    await prisma.multas_aluguel.update({ where: { aluguel_id: late.id }, data: { status: "paga" } });
    assert.equal((await request("/usuarios/me/bloqueio")).data, null);
    const paidFine = await prisma.pagamentos.create({ data: { aluguel_id: late.id, tipo: "multa", valor: 4, metodo: "pix", status: "pago", gateway: "demo" } });
    assert.equal((await request(`/pagamentos/${paidFine.id}/estornar`, renter, "POST", {})).data.codigo, "estorno_multa_admin_required");
    assert.equal((await request(`/admin/pagamentos/${paidFine.id}/estornar`, admin, "POST", {})).status, 200);
    assert.equal((await prisma.multas_aluguel.findUniqueOrThrow({ where: { aluguel_id: late.id } })).status, "pendente");
    assert.equal((await request("/usuarios/me/bloqueio")).data.motivo, "multa_pendente");
    await prisma.multas_aluguel.update({ where: { aluguel_id: late.id }, data: { status: "paga" } });
  });

  await t.test("proprietário com obrigação atrasada não aprova outra solicitação", async () => {
    const borrowed = await prisma.itens.create({ data: { usuario_id: other.id, titulo: "Emprestado ao dono", preco_por_dia: 10, valor_mercado: 100 } });
    const old = new Date(businessDate().getTime() - 2 * 86400000);
    const late = await prisma.alugueis.create({ data: { item_id: borrowed.id, locador_id: other.id, locatario_id: owner.id, data_inicio: old, data_fim: old, valor_total: 10, status: "retirado" } });
    const target = await prisma.itens.create({ data: { usuario_id: owner.id, titulo: "Pedido aguardando dono", preco_por_dia: 10, valor_mercado: 100 } });
    const pending = await request("/solicitacoes", other, "POST", { ...period, produto_id: target.id });
    assert.equal(pending.status, 201);
    assert.equal((await request(`/solicitacoes/${pending.data.id}`, owner, "PATCH", { status: "aprovado" })).data.codigo, "usuario_com_devolucao_pendente");
    await prisma.alugueis.update({ where: { id: late.id }, data: { status: "devolvido" } });
    assert.equal((await request(`/solicitacoes/${pending.data.id}`, owner, "PATCH", { status: "aprovado" })).status, 200);
  });

  // Verifica a transição após confirmação das duas partes e o congelamento da multa.
  await t.test("retirada/devolução canônicas exigem duas partes e congelam multa 10/90", async () => {
    const target = await prisma.itens.create({ data: { usuario_id: owner.id, titulo: "Fotos", preco_por_dia: 10, valor_mercado: 100 } });
    const old = new Date(businessDate().getTime() - 86400000);
    const rental = await prisma.alugueis.create({ data: { item_id: target.id, locador_id: owner.id, locatario_id: renter.id, data_inicio: old, data_fim: old, valor_total: 10, status: "pago" } });
    const form = () => { const f = new FormData(); f.append("observacoes", "Tudo certo"); f.append("fotos", new Blob([png], { type: "image/png" }), "foto.png"); return f; };
    assert.equal((await request(`/solicitacoes/${rental.id}/devolucao/fotos`, renter, "POST", form())).status, 409);
    assert.equal((await request(`/solicitacoes/${rental.id}/retirada/fotos`, other, "POST", form())).status, 403);
    const tooMany = new FormData(); for (let i = 0; i < 6; i++) tooMany.append("fotos", new Blob([png], { type: "image/png" }), "foto.png");
    assert.equal((await request(`/solicitacoes/${rental.id}/retirada/fotos`, renter, "POST", tooMany)).status, 422);
    const tooLarge = new FormData(); tooLarge.append("fotos", new Blob([Buffer.alloc(5 * 1024 * 1024 + 1)], { type: "image/png" }), "foto.png");
    assert.equal((await request(`/solicitacoes/${rental.id}/retirada/fotos`, renter, "POST", tooLarge)).status, 422);
    assert.equal((await request(`/solicitacoes/${rental.id}/retirada/fotos`, renter, "POST", form())).status, 201);
    assert.equal((await prisma.alugueis.findUniqueOrThrow({ where: { id: rental.id } })).status, "pago");
    assert.equal((await request(`/solicitacoes/${rental.id}/retirada/fotos`, owner, "POST", form())).status, 201);
    assert.equal((await prisma.alugueis.findUniqueOrThrow({ where: { id: rental.id } })).status, "retirado");
    const status = (await request(`/solicitacoes/${rental.id}/retirada`)).data;
    assert.equal(status.locatario.quantidade, 1); assert.equal(status.locatario.observacoes, "Tudo certo");
    const url = status.locatario.fotos[0];
    assert.equal((await fetch(origin + url)).status, 401);
    assert.equal((await fetch(origin + url, { headers: { Authorization: `Bearer ${token(other)}` } })).status, 404);
    assert.equal((await fetch(origin + url, { headers: { Authorization: `Bearer ${token(renter)}` } })).status, 200);
    assert.equal((await request(`/solicitacoes/${rental.id}/devolucao/fotos`, renter, "POST", form())).status, 201);
    assert.equal((await request(`/solicitacoes/${rental.id}/devolucao/fotos`, owner, "POST", form())).status, 201);
    const fine = await prisma.multas_aluguel.findUniqueOrThrow({ where: { aluguel_id: rental.id } });
    assert.equal(Number(fine.valor_total), 2); assert.equal(Number(fine.valor_plataforma), 0.2); assert.equal(Number(fine.valor_proprietario), 1.8);
    assert.equal(fine.status, "pendente");
    assert.equal((await request(`/solicitacoes/${rental.id}/multa`)).data.valor_total, 2);
    assert.equal((await request(`/solicitacoes/${rental.id}/devolucao`)).data.concluido_em !== null, true);
    assert.equal(await prisma.notificacoes.count({ where: { usuario_id: renter.id, tipo: "devolucao_confirmada", contexto: { path: ["solicitacao_id"], equals: rental.id } } }), 1);
  });

  await t.test("relatos deduplicados e notas internas não aparecem ao usuário", async () => {
    const rental = await prisma.alugueis.findFirstOrThrow({ where: { locatario_id: renter.id, status: "devolvido" }, orderBy: { criado_em: "desc" } });
    const body = { solicitacao_id: rental.id, etapa: "devolucao", motivo: "objeto_danificado", descricao: "Arranhão observado" };
    const a = await request("/relatos", renter, "POST", body);
    const b = await request("/relatos", renter, "POST", body);
    assert.equal(a.status, 201); assert.equal(b.data.id, a.data.id);
    await prisma.denuncias.update({ where: { id: a.data.id }, data: { notas: "Interno secreto", resposta_usuario: "Estamos analisando" } });
    const rows = (await request(`/solicitacoes/${rental.id}/relatos`)).data;
    assert.equal(rows.find((r: any) => r.id === a.data.id).resposta_usuario, "Estamos analisando");
    assert.equal(JSON.stringify(rows).includes("Interno secreto"), false);
    assert.equal((await request(`/solicitacoes/${rental.id}/relatos`, other)).status, 403);
    assert.equal(await prisma.notificacoes.count({ where: { usuario_id: owner.id, tipo: "problema_reportado" } }) > 0, true);
    const pickupItem = await prisma.itens.create({ data: { usuario_id: owner.id, titulo: "Relato retirada", preco_por_dia: 10, valor_mercado: 100 } });
    const pickupRental = await prisma.alugueis.create({ data: { item_id: pickupItem.id, locador_id: owner.id, locatario_id: renter.id, data_inicio: businessDate(), data_fim: businessDate(), valor_total: 10, status: "retirado" } });
    const pickup = await request("/relatos", renter, "POST", { solicitacao_id: pickupRental.id, etapa: "retirada", motivo: "objeto_incompleto", descricao: "Falta peça" });
    assert.equal(pickup.status, 201);
    assert.equal((await request(`/solicitacoes/${pickupRental.id}/relatos`)).data[0].etapa, "retirada");
  });

  await t.test("notificações UUID, badge, leitura, exclusão, CORS e avaliações UUID", async () => {
    const notification = await prisma.notificacoes.create({ data: { usuario_id: renter.id, tipo: "lembrete", titulo: "Lembrete", mensagem: "Teste" } });
    assert.equal((await request("/notificacoes/nao-lidas/contagem")).data.quantidade > 0, true);
    assert.equal((await request(`/notificacoes/${notification.id}`, other, "PATCH", { lida: true })).status, 403);
    assert.equal((await request(`/notificacoes/${notification.id}`, renter, "PATCH", { lida: true })).data.lida, true);
    assert.equal((await request(`/notificacoes/${notification.id}`, renter, "DELETE")).status, 200);
    assert.equal((await request("/notificacoes?desde=abc")).status, 422);
    const preflight = await fetch(base + "/solicitacoes", { method: "OPTIONS", headers: { Origin: "http://localhost:8080", "Access-Control-Request-Headers": "Authorization,Idempotency-Key,Content-Type" } });
    assert.equal(preflight.status, 204);
    assert.match(preflight.headers.get("access-control-allow-headers") ?? "", /Idempotency-Key/);
    assert.equal((await request(`/usuarios/${owner.id}/avaliacoes-recebidas`)).status, 200);
    assert.equal((await request(`/objetos/${item.id}/avaliacoes`)).status, 200);
    assert.equal((await request(`/produtos/${item.id}/avaliacoes`)).status, 200);
  });

  await t.test("tokens demo têm resultados definidos e não alteram valores do servidor", async () => {
    for (const [tokenValue, expected] of [["tok_demo_approved", "aprovado"], ["tok_demo_refused", "recusado"], ["tok_demo_pending", "pendente"]] as const) {
      const target = await prisma.itens.create({ data: { usuario_id: owner.id, titulo: tokenValue, preco_por_dia: 10, valor_mercado: 100 } });
      const start = businessDate(new Date(Date.now() + 86400000));
      const rental = await prisma.alugueis.create({ data: { item_id: target.id, locador_id: owner.id, locatario_id: other.id, data_inicio: start, data_fim: start, valor_total: 10, preco_dia_contratado: 10, taxa_plataforma: 1, status: "aprovado" } });
      const response = await request(`/solicitacoes/${rental.id}/pagamentos`, other, "POST", { metodo: "cartao", token_cartao: tokenValue, payment_method_id: "demo", valor_total: 1 }, { "Idempotency-Key": crypto.randomUUID() });
      assert.equal(response.status, 200, JSON.stringify(response.data));
      assert.equal(response.data.status, expected);
      assert.equal(response.data.valor_total, 11);
    }
  });

  await t.test("job estorna pagamento demo quando não houve retirada", async () => {
    const target = await prisma.itens.create({ data: { usuario_id: owner.id, titulo: "Sem retirada", preco_por_dia: 10, valor_mercado: 100 } });
    const old = new Date(businessDate().getTime() - 86400000);
    const rental = await prisma.alugueis.create({ data: { item_id: target.id, locador_id: owner.id, locatario_id: other.id, data_inicio: old, data_fim: old, valor_total: 10, status: "pago" } });
    const payment = await prisma.pagamentos.create({ data: { aluguel_id: rental.id, tipo: "aluguel", valor: 11, metodo: "pix", status: "pago", gateway: "demo" } });
    const { maintainRentals } = await import("../../app/services/rentalMaintenance.ts");
    await maintainRentals(true);
    assert.equal((await prisma.pagamentos.findUniqueOrThrow({ where: { id: payment.id } })).status, "estornado");
    assert.equal((await prisma.alugueis.findUniqueOrThrow({ where: { id: rental.id } })).status, "cancelado");
    assert.equal(await prisma.notificacoes.count({ where: { chave: `${rental.id}:retirada_nao_realizada:${other.id}` } }), 1);
  });
});
