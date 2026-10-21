// Exercita permissões, auditoria, moderação, conciliação e métricas administrativas contra banco isolado.
import assert from "node:assert/strict";
import test from "node:test";
import crypto from "node:crypto";
import type { AddressInfo } from "node:net";
import { writeFile, unlink } from "node:fs/promises";
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
  const { resetRateLimitBucketsForTests } = await import("../../app/middlewares/rateLimit.ts");
  t.beforeEach(() => resetRateLimitBucketsForTests());
  const server = app.listen(0, "127.0.0.1");
  await new Promise<void>(resolve => server.once("listening", resolve));
  t.after(async () => { await new Promise<void>(resolve => server.close(() => resolve())); await prisma.$disconnect(); });
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/admin`;
  const admin = await prisma.usuarios.create({ data: { nome: "Admin", email: `admin-${crypto.randomUUID()}@test.local`, cpf: cpf(), senha_hash: "x", tipo: "admin" } });
  const otherAdmin = await prisma.usuarios.create({ data: { nome: "Outro Admin", email: `admin-${crypto.randomUUID()}@test.local`, cpf: cpf(), senha_hash: "x", tipo: "admin" } });
  const owner = await prisma.usuarios.create({ data: { nome: "Owner", email: `owner-${crypto.randomUUID()}@test.local`, cpf: cpf(), senha_hash: "x" } });
  const renter = await prisma.usuarios.create({ data: { nome: "Renter", email: `renter-${crypto.randomUUID()}@test.local`, cpf: cpf(), senha_hash: "x" } });
  const token = (u: typeof admin, version = u.token_version) => jwt.sign({ id: u.id, email: u.email, tipo: u.tipo, tokenVersion: version }, env.JWT_KEY);
  const adminToken = token(admin), ownerToken = token(owner);
  const otherAdminToken = token(otherAdmin);
  async function api(path: string, method = "GET", body?: unknown, bearer: string | null = adminToken) {
    const headers: Record<string, string> = {};
    if (bearer) headers.Authorization = `Bearer ${bearer}`;
    if (body !== undefined) headers["Content-Type"] = "application/json";
    const response = await fetch(base + path, { method, headers, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
    return { status: response.status, data: await response.json() as any };
  }
  async function publicApi(path: string, bearer: string | null = null, method = "GET", body?: unknown) {
    const headers: Record<string, string> = {};
    if (bearer) headers.Authorization = `Bearer ${bearer}`;
    if (body !== undefined) headers["Content-Type"] = "application/json";
    const response = await fetch(base.replace("/api/admin", "/api") + path, { method, headers, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
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
    assert.equal((await api("/usuarios")).status, 403);
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
  await t.test("aluguéis do usuário usam o DTO canônico, sem duplicação e com paginação no banco", async () => {
    const owned = await prisma.itens.create({ data: { usuario_id: owner.id, titulo: "Aluguel como dono", preco_por_dia: 30, valor_mercado: 300 } });
    const rented = await prisma.itens.create({ data: { usuario_id: renter.id, titulo: "Aluguel como locatário", preco_por_dia: 20, valor_mercado: 200 } });
    const both = await prisma.itens.create({ data: { usuario_id: owner.id, titulo: "Mesma pessoa", preco_por_dia: 10, valor_mercado: 100 } });
    const dates = { data_inicio: new Date("2039-01-01"), data_fim: new Date("2039-01-03") };
    const rows = await Promise.all([
      prisma.alugueis.create({ data: { item_id: owned.id, locador_id: owner.id, locatario_id: renter.id, ...dates, valor_total: 90, taxa_plataforma: 9, status: "finalizado" } }),
      prisma.alugueis.create({ data: { item_id: rented.id, locador_id: renter.id, locatario_id: owner.id, ...dates, valor_total: 60, taxa_plataforma: 6, status: "finalizado" } }),
      prisma.alugueis.create({ data: { item_id: both.id, locador_id: owner.id, locatario_id: owner.id, ...dates, valor_total: 30, taxa_plataforma: 3, status: "cancelado" } }),
    ]);
    await prisma.pagamentos.create({ data: { aluguel_id: rows[0]!.id, valor: 99, metodo: "cartao", status: "pago", gateway: "demo", tipo: "aluguel", dados: { token_cartao: "nao-expor" } } });
    const result = await api(`/usuarios/${owner.id}/alugueis?page=1&limit=100`);
    assert.equal(result.status, 200, JSON.stringify(result.data));
    assert.equal(result.data.data.filter((row:any)=>row.id===rows[2]!.id).length, 1);
    for (const row of rows) assert.ok(result.data.data.some((entry:any)=>entry.id===row.id));
    const dto=result.data.data.find((row:any)=>row.id===rows[0]!.id);
    for(const field of ["produto","proprietario","solicitante","data_retirada","data_devolucao","dias","subtotal","taxa_servico","total","pagamentos","multa","criadoEm"])assert.ok(Object.hasOwn(dto,field),field);
    assert.equal(dto.produto.titulo,"Aluguel como dono");
    assert.equal(JSON.stringify(dto).includes("nao-expor"),false);
    assert.equal((await api(`/usuarios/${owner.id}/alugueis?limit=0`)).status,422);
    assert.equal((await api(`/usuarios/${crypto.randomUUID()}/alugueis`)).status,404);
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
    const log = await prisma.admin_auditoria.findFirst({ where: { entidade: "objeto", entidade_id: item.id, acao: "anuncio_ocultado" } });
    assert.equal(log?.admin_id, admin.id); assert.equal((log?.metadata as any).motivo, "Irregular");
    assert.equal((await api(`/objetos/${crypto.randomUUID()}`, "DELETE", { motivo: "Teste" })).status, 404);
    const rental = await prisma.alugueis.create({ data: { item_id: item.id, locador_id: owner.id, locatario_id: renter.id, data_inicio: new Date("2027-01-01"), data_fim: new Date("2027-01-02"), valor_total: 10, status: "pago" } });
    assert.equal((await api(`/objetos/${item.id}`, "DELETE", { motivo: "Teste" })).status, 409);
    assert.equal(await prisma.admin_auditoria.count({ where: { entidade: "objeto", entidade_id: item.id, acao: "anuncio_arquivado" } }), 0);
    await prisma.alugueis.update({ where: { id: rental.id }, data: { status: "finalizado" } });
    assert.equal((await api(`/objetos/${item.id}`, "DELETE", { motivo: "Teste" })).status, 200);
    assert.equal((await prisma.itens.findUniqueOrThrow({ where: { id: item.id } })).arquivado, true);
  });
  await t.test("moderação preserva a preferência do dono, bloqueia contornos e protege o catálogo", async () => {
    const available=await prisma.itens.create({data:{usuario_id:owner.id,titulo:"Moderado disponível",descricao:"Teste",preco_por_dia:10,valor_mercado:100,disponivel:true}});
    const paused=await prisma.itens.create({data:{usuario_id:owner.id,titulo:"Moderado pausado",descricao:"Teste",preco_por_dia:10,valor_mercado:100,disponivel:false}});
    const beforeNotices=await prisma.notificacoes.count({where:{usuario_id:owner.id,tipo:"anuncio_ocultado_admin"}});
    const hidden=await api(`/objetos/${available.id}`,"PATCH",{disponivel:false,motivo:"Anúncio em análise"});
    assert.equal(hidden.status,200,JSON.stringify(hidden.data));
    assert.equal(hidden.data.disponivel,true);
    assert.equal(hidden.data.oculto_pelo_admin,true);
    assert.equal(hidden.data.status,"ativo");
    assert.equal((await api(`/objetos/${available.id}`,"PATCH",{disponivel:false,motivo:"Anúncio em análise"})).status,200);
    assert.equal(await prisma.notificacoes.count({where:{usuario_id:owner.id,tipo:"anuncio_ocultado_admin"}}),beforeNotices+1);
    const ownerEdit=await publicApi(`/objetos/${available.id}`,ownerToken,"PATCH",{titulo:"Tentativa"});
    assert.equal(ownerEdit.status,409);assert.equal(ownerEdit.data.codigo,"objeto_oculto_pelo_admin");
    assert.equal((await publicApi(`/objetos/${available.id}`)).status,404);
    const ownerView=await publicApi(`/objetos/${available.id}`,ownerToken);
    assert.equal(ownerView.status,200);assert.equal(ownerView.data.motivo_ocultacao,"Anúncio em análise");
    const request=await publicApi("/solicitacoes",token(renter),"POST",{produto_id:available.id,data_retirada:"2040-01-01",data_devolucao:"2040-01-02"});
    assert.equal(request.status,409);assert.equal(request.data.codigo,"objeto_indisponivel");
    const shown=await api(`/objetos/${available.id}`,"PATCH",{disponivel:true});
    assert.equal(shown.data.oculto_pelo_admin,false);assert.equal(shown.data.disponivel,true);assert.equal(shown.data.motivo_ocultacao,null);

    await api(`/objetos/${paused.id}`,"PATCH",{disponivel:false,motivo:"Pausa moderada"});
    const pausedShown=await api(`/objetos/${paused.id}`,"PATCH",{disponivel:true});
    assert.equal(pausedShown.data.oculto_pelo_admin,false);assert.equal(pausedShown.data.disponivel,false);
    const archived=await api(`/objetos/${paused.id}`,"DELETE",{motivo:"Encerramento administrativo"});
    assert.equal(archived.status,200);assert.equal(archived.data.status,"arquivado");assert.equal(archived.data.disponivel,false);
    const ownerArchivedEdit=await publicApi(`/objetos/${paused.id}`,ownerToken,"PATCH",{disponivel:true});
    assert.equal(ownerArchivedEdit.status,409);assert.equal(ownerArchivedEdit.data.codigo,"objeto_arquivado");
    assert.equal((await publicApi(`/objetos/${paused.id}`)).status,404);

    const adminItems=await api(`/objetos?proprietario_id=${owner.id}&page=1&limit=100`);
    assert.equal(adminItems.status,200);assert.ok(adminItems.data.data.some((row:any)=>row.id===paused.id&&row.status==="arquivado"));
    assert.ok(adminItems.data.data.every((row:any)=>row.usuario_id===owner.id));
    assert.equal((await api("/objetos?proprietario_id=invalido")).status,422);
    const publicList=await publicApi("/objetos?limit=100");
    assert.equal(publicList.data.some((row:any)=>row.id===paused.id),false);
    assert.equal(publicList.data.some((row:any)=>Object.hasOwn(row,"motivo_ocultacao")),false);
  });
  await t.test("desarquivamento administrativo é seguro, atômico, concorrente e preserva visibilidade", async () => {
    const unarchiveOwner=await prisma.usuarios.create({data:{nome:"Dono desarquivamento",email:`desarquivar-${crypto.randomUUID()}@test.local`,cpf:cpf(),senha_hash:"x"}});
    const suspendedOwner=await prisma.usuarios.create({data:{nome:"Dono suspenso",email:`suspenso-${crypto.randomUUID()}@test.local`,cpf:cpf(),senha_hash:"x",ativo:false}});
    const ownerBearer=token(unarchiveOwner as typeof admin);
    const available=await prisma.itens.create({data:{usuario_id:unarchiveOwner.id,titulo:"Furadeira concorrente",preco_por_dia:15,valor_mercado:150,disponivel:true,arquivado:true}});
    const paused=await prisma.itens.create({data:{usuario_id:unarchiveOwner.id,titulo:"Anúncio pausado",preco_por_dia:15,valor_mercado:150,disponivel:false,arquivado:true}});
    const hidden=await prisma.itens.create({data:{usuario_id:unarchiveOwner.id,titulo:"Anúncio ocultado",preco_por_dia:15,valor_mercado:150,disponivel:true,arquivado:true,oculto_pelo_admin:true,motivo_ocultacao:"Moderação anterior preservada"}});
    const suspended=await prisma.itens.create({data:{usuario_id:suspendedOwner.id,titulo:"Anúncio de conta suspensa",preco_por_dia:15,valor_mercado:150,disponivel:true,arquivado:true}});
    const active=await prisma.itens.create({data:{usuario_id:unarchiveOwner.id,titulo:"Já ativo",preco_por_dia:15,valor_mercado:150}});

    assert.equal((await api(`/objetos/${available.id}/desarquivar`,"POST",{motivo:"Revisado"},null)).status,401);
    assert.equal((await api(`/objetos/${available.id}/desarquivar`,"POST",{motivo:"Revisado"},ownerBearer)).status,403);
    for(const motivo of [undefined,"","   "])assert.equal((await api(`/objetos/${available.id}/desarquivar`,"POST",motivo===undefined?{}:{motivo})).status,422);
    assert.equal((await api(`/objetos/${available.id}/desarquivar`,"POST",{motivo:"Revisado",disponivel:false})).status,422);
    assert.equal((await api("/objetos/id-invalido/desarquivar","POST",{motivo:"Revisado"})).status,422);
    assert.equal((await api(`/objetos/${crypto.randomUUID()}/desarquivar`,"POST",{motivo:"Revisado"})).status,404);
    const already=await api(`/objetos/${active.id}/desarquivar`,"POST",{motivo:"Não necessário"});
    assert.equal(already.status,409);assert.equal(already.data.codigo,"nao_arquivado");assert.equal(already.data.mensagem,"Este anúncio já está ativo e não precisa ser desarquivado.");
    assert.equal(await prisma.admin_auditoria.count({where:{entidade:"objeto",entidade_id:active.id,acao:"anuncio_desarquivado"}}),0);

    const reason="Anúncio revisado e liberado pela administração.";
    const [first,second]=await Promise.all([
      api(`/objetos/${available.id}/desarquivar`,"POST",{motivo:reason}),
      api(`/objetos/${available.id}/desarquivar`,"POST",{motivo:reason},otherAdminToken),
    ]);
    assert.deepEqual([first.status,second.status].sort(),[200,409]);
    const success=first.status===200?first:second;
    const conflict=first.status===409?first:second;
    assert.equal(conflict.data.codigo,"nao_arquivado");
    assert.equal(success.data.id,available.id);assert.equal(success.data.status,"ativo");assert.equal(success.data.arquivado,false);
    assert.equal(success.data.disponivel,true);assert.equal(success.data.oculto_pelo_admin,false);
    assert.equal(typeof success.data.em_locacao,"boolean");assert.equal(typeof success.data.tem_solicitacao_pendente,"boolean");
    assert.equal(Object.hasOwn(success.data,"alugueis"),false);
    const availableStored=await prisma.itens.findUniqueOrThrow({where:{id:available.id}});
    assert.equal(availableStored.disponivel,true);assert.equal(availableStored.oculto_pelo_admin,false);assert.equal(availableStored.motivo_ocultacao,null);
    const auditRows=await prisma.admin_auditoria.findMany({where:{entidade:"objeto",entidade_id:available.id,acao:"anuncio_desarquivado"}});
    assert.equal(auditRows.length,1);assert.ok([admin.id,otherAdmin.id].includes(auditRows[0]!.admin_id));assert.equal((auditRows[0]!.metadata as any).motivo,reason);assert.ok(auditRows[0]!.criado_em);
    const notices=await prisma.notificacoes.findMany({where:{usuario_id:unarchiveOwner.id,tipo:"anuncio_desarquivado_admin",contexto:{path:["objetoId"],equals:available.id}}});
    assert.equal(notices.length,1);assert.equal(notices[0]!.titulo,"Anúncio desarquivado");assert.equal(notices[0]!.mensagem,'Seu anúncio "Furadeira concorrente" foi desarquivado pela administração.');

    const listed=await api(`/objetos?status=ativo&proprietario_id=${unarchiveOwner.id}&limit=100`);
    const listedDto=listed.data.data.find((row:any)=>row.id===available.id);
    assert.ok(listedDto);assert.deepEqual(success.data,listedDto);
    assert.equal((await api(`/objetos?status=arquivado&proprietario_id=${unarchiveOwner.id}&limit=100`)).data.data.some((row:any)=>row.id===available.id),false);
    assert.equal((await publicApi("/objetos?limit=100")).data.some((row:any)=>row.id===available.id),true);
    assert.equal((await publicApi(`/objetos/${available.id}`)).status,200);
    assert.equal((await publicApi(`/objetos/${available.id}`,adminToken)).status,200);
    assert.equal((await publicApi("/objetos/meus",ownerBearer)).data.some((row:any)=>row.id===available.id),true);

    const pausedResult=await api(`/objetos/${paused.id}/desarquivar`,"POST",{motivo:"Arquivo revisado"});
    assert.equal(pausedResult.status,200);assert.equal(pausedResult.data.disponivel,false);assert.equal(pausedResult.data.oculto_pelo_admin,false);
    assert.equal((await publicApi("/objetos?limit=100")).data.some((row:any)=>row.id===paused.id),false);
    assert.equal((await publicApi(`/objetos/${paused.id}`,ownerBearer)).status,200);

    const hiddenResult=await api(`/objetos/${hidden.id}/desarquivar`,"POST",{motivo:"Arquivo revisado"});
    assert.equal(hiddenResult.status,200);assert.equal(hiddenResult.data.disponivel,true);assert.equal(hiddenResult.data.oculto_pelo_admin,true);assert.equal(hiddenResult.data.motivo_ocultacao,"Moderação anterior preservada");
    assert.equal((await publicApi("/objetos?limit=100")).data.some((row:any)=>row.id===hidden.id),false);
    assert.equal((await publicApi(`/objetos/${hidden.id}`)).status,404);
    assert.equal((await publicApi(`/objetos/${hidden.id}`,adminToken)).status,200);

    assert.equal((await api(`/objetos/${suspended.id}/desarquivar`,"POST",{motivo:"Arquivo revisado"})).status,200);
    assert.equal((await publicApi("/objetos?limit=100")).data.some((row:any)=>row.id===suspended.id),false);
    assert.equal((await publicApi(`/objetos/${suspended.id}`)).status,404);
    assert.equal((await publicApi(`/objetos/${suspended.id}`,adminToken)).status,200);

    const ownerBlocked=await prisma.itens.create({data:{usuario_id:unarchiveOwner.id,titulo:"Bloqueado ao dono",preco_por_dia:15,valor_mercado:150,arquivado:true}});
    const attempted=await publicApi(`/objetos/${ownerBlocked.id}`,ownerBearer,"PATCH",{disponivel:true});
    assert.equal(attempted.status,409);assert.equal(attempted.data.codigo,"objeto_arquivado");
    const archiveRegression=await prisma.itens.create({data:{usuario_id:unarchiveOwner.id,titulo:"Arquivamento preservado",preco_por_dia:15,valor_mercado:150,disponivel:true}});
    const archived=await api(`/objetos/${archiveRegression.id}`,"DELETE",{motivo:"Política administrativa"});
    assert.equal(archived.status,200);assert.equal(archived.data.arquivado,true);assert.equal(archived.data.disponivel,true);
    assert.equal(await prisma.admin_auditoria.count({where:{entidade:"objeto",entidade_id:archiveRegression.id,acao:"anuncio_arquivado"}}),1);
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
    const blocked = await api(`/usuarios/${owner.id}/status`, "PATCH", { ativo: false, motivo: "Análise preventiva" }); assert.equal(blocked.status, 409); assert.equal(blocked.data.codigo, "usuario_com_obrigacoes_ativas");
    await prisma.alugueis.update({ where: { id: rental.id }, data: { status: "finalizado" } });
    assert.equal((await api(`/usuarios/${owner.id}/status`, "PATCH", { ativo: false, motivo: "Análise preventiva" })).status, 200);
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
  await t.test("documentos de identidade retornam bytes, MIME real e autorização administrativa", async () => {
    const {privateRoot}=await import("../../app/middlewares/privateUpload.ts");
    const file=`${crypto.randomUUID()}.png`;
    const bytes=Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+ip1sAAAAASUVORK5CYII=","base64");
    await writeFile(`${privateRoot}/${file}`,bytes);
    try{
      const verification=await prisma.verificacoes_identidade.create({data:{usuario_id:renter.id,tipo:"passaporte",status:"pendente",documentos:{documentoFrente:file,selfie:file}}});
      const list=await api("/verificacoes?status=pendente&page=1&limit=100");
      const listed=list.data.dados.find((row:any)=>row.id===verification.id);
      assert.equal(listed.usuario_ativo,true);assert.equal(listed.usuario.ativo,true);assert.equal(listed.nome,renter.nome);
      const detail=await api(`/verificacoes/${verification.id}`);
      assert.equal(detail.data.tipo_documento,"passaporte");assert.equal(detail.data.usuario.ativo,true);assert.equal(detail.data.usuario.tipo,"usuario");assert.ok(detail.data.usuario.criado_em);
      const url=`${base}/verificacoes/${verification.id}/arquivos/frente`;
      assert.equal((await fetch(url)).status,401);
      assert.equal((await fetch(url,{headers:{Authorization:`Bearer ${token(renter)}`}})).status,403);
      const response=await fetch(url,{headers:{Authorization:`Bearer ${adminToken}`}});
      assert.equal(response.status,200);assert.equal(response.headers.get("content-type"),"image/png");assert.equal(response.headers.get("cache-control"),"private, no-store");
      assert.deepEqual(Buffer.from(await response.arrayBuffer()),bytes);
      const cookieResponse=await fetch(url,{headers:{Cookie:`token=${adminToken}`}});assert.equal(cookieResponse.status,200);
      assert.equal((await fetch(`${base}/verificacoes/${verification.id}/arquivos/verso`,{headers:{Authorization:`Bearer ${adminToken}`}})).status,404);
      assert.equal((await fetch(`${base}/verificacoes/${crypto.randomUUID()}/arquivos/frente`,{headers:{Authorization:`Bearer ${adminToken}`}})).status,404);
      assert.equal((await fetch(`${base}/verificacoes/${verification.id}/arquivos/outro`,{headers:{Authorization:`Bearer ${adminToken}`}})).status,422);
      assert.equal(await prisma.admin_auditoria.count({where:{entidade:"verificacao",entidade_id:verification.id,acao:"documento_verificacao_acessado"}}),2);
    }finally{await unlink(`${privateRoot}/${file}`).catch(()=>undefined);}
  });
  await t.test("alertas operacionais: limiares, atraso e deduplicação concorrente", async () => {
    const reportedItem = await prisma.itens.create({ data: { usuario_id: owner.id, titulo: "Objeto denunciado", preco_por_dia: 10, valor_mercado: 100 } });
    await prisma.denuncias.createMany({ data: Array.from({ length: 3 }, () => ({ usuario_id: renter.id, denunciado_id: owner.id, objeto_id: reportedItem.id, motivo: "teste", mensagem: "Denúncia para limiar", protocolo: `ADM-${crypto.randomUUID()}` })) });
    const delayed = await prisma.verificacoes_identidade.create({ data: { usuario_id: renter.id, documentos: {}, status: "pendente", criado_em: new Date(Date.now() - 49 * 60 * 60 * 1000) } });
    const recent = await prisma.verificacoes_identidade.create({ data: { usuario_id: owner.id, documentos: {}, status: "pendente", criado_em: new Date(Date.now() - 47 * 60 * 60 * 1000) } });
    const { processAdminOperationalAlerts } = await import("../../app/services/adminOperationalMaintenance.ts");
    await Promise.all([processAdminOperationalAlerts(), processAdminOperationalAlerts()]);
    for (const [tipo, referencia_id] of [["usuario_reincidente", owner.id], ["anuncio_muito_denunciado", reportedItem.id], ["verificacao_atrasada", delayed.id]] as const) {
      assert.equal(await prisma.notificacoes_admin.count({ where: { tipo, referencia_id } }), 1);
    }
    assert.equal(await prisma.notificacoes_admin.count({ where: { tipo: "verificacao_atrasada", referencia_id: recent.id } }), 0);
  });
  await t.test("comunicados agendados: idempotência, concorrência e auditoria", async () => {
    const key = `campanha-${crypto.randomUUID()}`;
    const body = { titulo: "Aviso agendado", mensagem: "Mensagem operacional", destinatarios: "todos", status: "agendada", agendada_para: new Date(Date.now() + 3600000).toISOString(), chave_idempotencia: key };
    const created = await api("/comunicados", "POST", body);
    assert.equal(created.status, 201, JSON.stringify(created.data));
    assert.equal((await api("/comunicados", "POST", body)).data.id, created.data.id);
    assert.equal((await api("/comunicados", "POST", { ...body, mensagem: "Conteúdo diferente" })).status, 409);
    const audience = await prisma.usuarios.count();
    await prisma.comunicados_admin.update({ where: { id: created.data.id }, data: { agendada_para: new Date(Date.now() - 1000) } });
    const { processAdminCampaigns } = await import("../../app/services/adminCampaigns.ts");
    await Promise.all([processAdminCampaigns(), processAdminCampaigns()]);
    const campaign = await prisma.comunicados_admin.findUniqueOrThrow({ where: { id: created.data.id } });
    assert.equal(campaign.status, "enviada");
    assert.equal(campaign.total_destinatarios, audience);
    assert.equal(await prisma.comunicados_admin_entregas.count({ where: { comunicado_id: campaign.id } }), audience);
    assert.equal(await prisma.notificacoes.count({ where: { chave: { startsWith: `comunicado:${campaign.id}:` } } }), audience);
    assert.equal(await prisma.admin_auditoria.count({ where: { entidade: "comunicado", entidade_id: campaign.id, acao: "notificacao_enviada" } }), 1);
  });
  await t.test("notificações administrativas: leitura, preferências e dispensa", async () => {
    const notice = await prisma.notificacoes_admin.create({ data: { tipo: "teste_operacional", categoria: "sistema", prioridade: "alta", titulo: "Atenção", mensagem: "Teste administrativo", chave_deduplicacao: `teste:${crypto.randomUUID()}` } });
    const listed = await api("/notificacoes?categoria=sistema&prioridade=alta&lida=false");
    assert.equal(listed.status, 200);
    assert.ok(listed.data.data.some((row: any) => row.id === notice.id));
    assert.equal((await api(`/notificacoes/${notice.id}`, "PATCH", { lida: true })).data.lida, true);
    assert.equal((await api("/notificacoes/resumo")).status, 200);
    const categories = Object.fromEntries(["usuarios", "anuncios", "denuncias", "pagamentos", "avaliacoes", "verificacoes", "sistema"].map(category => [category, true]));
    assert.equal((await api("/notificacoes/preferencias", "PUT", { categorias: categories, somente_urgentes: true })).data.somente_urgentes, true);
    assert.equal((await api(`/notificacoes/${notice.id}/dispensar`, "POST", {})).status, 200);
    assert.equal((await api("/notificacoes?categoria=sistema")).data.data.some((row: any) => row.id === notice.id), false);
  });
  await t.test("comunicado de teste fica somente na caixa administrativa destinatária", async () => {
    await api("/notificacoes/preferencias", "PUT", { categorias: { usuarios:true, anuncios:true, denuncias:true, pagamentos:true, avaliacoes:true, verificacoes:true, sistema:true }, somente_urgentes:false });
    const title = "  Teste de notificação  ";
    const message = "  Esta é uma mensagem de teste.  ";
    const before = await api("/notificacoes/resumo");
    const commonBefore = await prisma.notificacoes.count();
    const campaignsBefore = await prisma.comunicados_admin.count();
    const deliveriesBefore = await prisma.comunicados_admin_entregas.count();
    const created = await api("/comunicados/teste", "POST", { titulo: title, mensagem: message });
    assert.equal(created.status, 201, JSON.stringify(created.data));
    const stored = await prisma.notificacoes_admin.findUniqueOrThrow({ where: { id: created.data.id } });
    assert.equal(stored.destinatario_admin_id, admin.id);
    assert.equal(stored.tipo, "comunicado_teste");
    assert.equal(stored.categoria, "sistema");
    assert.equal(stored.prioridade, "normal");
    assert.equal(stored.titulo, title.trim());
    assert.equal(stored.mensagem, message.trim());
    const ownerList = await api("/notificacoes?categoria=sistema&limit=100");
    assert.ok(ownerList.data.data.some((row:any) => row.id === stored.id && row.titulo === title.trim() && row.mensagem === message.trim() && row.referencia === null && row.lida === false));
    const otherList = await api("/notificacoes?categoria=sistema&limit=100", "GET", undefined, otherAdminToken);
    assert.equal(otherList.data.data.some((row:any) => row.id === stored.id), false);
    assert.equal((await api(`/notificacoes/${stored.id}`, "PATCH", { lida: true }, otherAdminToken)).status, 404);
    assert.equal((await api(`/notificacoes/${stored.id}/dispensar`, "POST", {}, otherAdminToken)).status, 404);
    const after = await api("/notificacoes/resumo");
    assert.equal(after.data.nao_lidas, before.data.nao_lidas + 1);
    assert.equal(after.data.recebidas_hoje, before.data.recebidas_hoje + 1);
    assert.equal(after.data.por_categoria.sistema, before.data.por_categoria.sistema + 1);
    assert.equal((await api(`/notificacoes/${stored.id}`, "PATCH", { lida: true })).status, 200);
    assert.equal((await api("/notificacoes/resumo")).data.nao_lidas, before.data.nao_lidas);
    assert.equal((await api(`/notificacoes/${stored.id}/dispensar`, "POST", {})).status, 200);
    assert.equal((await api("/notificacoes?categoria=sistema&limit=100")).data.data.some((row:any) => row.id === stored.id), false);
    assert.equal(await prisma.notificacoes.count(), commonBefore);
    assert.equal(await prisma.comunicados_admin.count(), campaignsBefore);
    assert.equal(await prisma.comunicados_admin_entregas.count(), deliveriesBefore);
    assert.equal((await api("/comunicados/teste", "POST", { titulo: "Teste", mensagem: "Mensagem" }, token(renter))).status, 403);
    assert.equal((await api("/comunicados/teste", "POST", { titulo: "Teste", mensagem: "Mensagem" }, null)).status, 401);
  });
  await t.test("notificação administrativa lida expira individualmente após 90 dias", async () => {
    const notice = await prisma.notificacoes_admin.create({ data: { destinatario_admin_id: admin.id, tipo: "comunicado_teste", categoria: "sistema", prioridade: "normal", titulo: "Expirada", mensagem: "Mensagem antiga" } });
    await prisma.notificacoes_admin_estado.create({ data: { notificacao_id: notice.id, admin_id: admin.id, lida: true, lida_em: new Date(Date.now() - 91 * 86400000) } });
    assert.equal((await api("/notificacoes?categoria=sistema&limit=100")).data.data.some((row:any) => row.id === notice.id), false);
    const state = await prisma.notificacoes_admin_estado.findUniqueOrThrow({ where: { notificacao_id_admin_id: { notificacao_id: notice.id, admin_id: admin.id } } });
    assert.equal(state.dispensada, true);
    assert.equal((await api("/notificacoes?categoria=sistema&limit=100", "GET", undefined, otherAdminToken)).data.data.some((row:any) => row.id === notice.id), false);
  });
  await t.test("ocorrências filtram o denunciado por UUID e usam a mesma definição das estatísticas", async () => {
    const target=await prisma.usuarios.create({data:{nome:"Pessoa Homônima",email:`alvo-${crypto.randomUUID()}@test.local`,cpf:cpf(),senha_hash:"x"}});
    const homonym=await prisma.usuarios.create({data:{nome:"Pessoa Homônima",email:`homonimo-${crypto.randomUUID()}@test.local`,cpf:cpf(),senha_hash:"x"}});
    const clean=await prisma.usuarios.create({data:{nome:"Sem denúncias",email:`limpo-${crypto.randomUUID()}@test.local`,cpf:cpf(),senha_hash:"x"}});
    const reportedItem=await prisma.itens.create({data:{usuario_id:target.id,titulo:"Anúncio denunciado",preco_por_dia:10,valor_mercado:100}});
    const open=await prisma.denuncias.create({data:{usuario_id:renter.id,denunciado_id:target.id,objeto_id:reportedItem.id,motivo:"conteudo",mensagem:"Aberta",status:"aberta",prioridade:"alta",protocolo:`ADM-${crypto.randomUUID()}`}});
    const resolved=await prisma.denuncias.create({data:{usuario_id:renter.id,denunciado_id:target.id,motivo:"conduta",mensagem:"Resolvida",status:"resolvida",prioridade:"normal",protocolo:`ADM-${crypto.randomUUID()}`}});
    await prisma.denuncias.create({data:{usuario_id:renter.id,denunciado_id:homonym.id,motivo:"conduta",mensagem:"Outro homônimo",status:"aberta",protocolo:`ADM-${crypto.randomUUID()}`}});
    const system=await prisma.denuncias.create({data:{usuario_id:renter.id,denunciado_id:target.id,motivo:"retirada_evidencia_unilateral",mensagem:"Ocorrência automática",status:"aberta",protocolo:`ADM-${crypto.randomUUID()}`}});
    const filtered=await api(`/ocorrencias?tipo=denuncia&denunciado_id=${target.id}&page=1&limit=25`);
    assert.equal(filtered.status,200,JSON.stringify(filtered.data));assert.equal(filtered.data.total,2);
    assert.deepEqual(new Set(filtered.data.data.map((row:any)=>row.id)),new Set([open.id,resolved.id]));
    assert.equal(filtered.data.data.some((row:any)=>row.id===system.id),false);
    assert.ok(filtered.data.data.every((row:any)=>row.denunciado.id===target.id));
    const combined=await api(`/ocorrencias?tipo=denuncia&denunciado_id=${target.id}&status=aberta&prioridade=alta&page=1&limit=1`);
    assert.equal(combined.data.total,1);assert.equal(combined.data.data[0].id,open.id);
    const mixed=await api("/ocorrencias?page=1&limit=2");assert.equal(mixed.status,200,JSON.stringify(mixed.data));assert.ok(mixed.data.data.length<=2);
    assert.equal((await api(`/ocorrencias?tipo=suporte&denunciado_id=${target.id}`)).data.total,0);
    const detail=await api(`/usuarios/${target.id}`);
    assert.equal(detail.data.estatisticas.denuncias_recebidas,filtered.data.total);
    assert.equal((await api(`/usuarios/${clean.id}`)).data.estatisticas.denuncias_recebidas,0);
    assert.equal((await api("/ocorrencias?denunciado_id=invalido")).status,422);
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
    assert.equal((await api(`/avaliacoes/${review.id}`, "DELETE", { motivo: "Conteúdo inadequado" })).status, 200);
    assert.equal(await prisma.admin_auditoria.count({ where: { entidade: "avaliacao", entidade_id: review.id } }), 1);
  });
  await t.test("admin consulta avaliações de anúncio arquivado sem abrir acesso público",async()=>{
    const target=await prisma.itens.create({data:{usuario_id:owner.id,titulo:"Avaliações arquivadas",preco_por_dia:10,valor_mercado:100}});
    const rental=await prisma.alugueis.create({data:{item_id:target.id,locador_id:owner.id,locatario_id:renter.id,data_inicio:new Date("2038-01-01"),data_fim:new Date("2038-01-02"),valor_total:10,status:"finalizado"}});
    const review=await prisma.avaliacoes.create({data:{aluguel_id:rental.id,item_id:target.id,avaliador_id:renter.id,avaliado_id:owner.id,contexto:"objeto",nota:5,comentario:"Ótimo"}});
    assert.equal((await api(`/objetos/${target.id}`,"DELETE",{motivo:"Fim do anúncio"})).status,200);
    const path=`/objetos/${target.id}/avaliacoes?page=1&limit=100`;
    const adminResult=await publicApi(path,adminToken);
    assert.equal(adminResult.status,200);assert.ok(adminResult.data.some((row:any)=>row.id===review.id));
    assert.equal((await publicApi(path,token(renter))).status,404);
    const currentOwner=await prisma.usuarios.findUniqueOrThrow({where:{id:owner.id}});
    assert.equal((await publicApi(path,token(currentOwner))).status,200);
  });
  await t.test("categorias: slug, edição e uso", async () => {
    assert.equal((await api("/categorias")).status, 200);
    const name = `Nova categoria ${crypto.randomUUID().slice(0, 8)}`;
    const created = await api("/categorias", "POST", { nome: name, icone: "bi-tag", cor: "#6D49F2" }); assert.equal(created.status, 201);
    assert.equal((await api("/categorias", "POST", { nome: name.toUpperCase(), icone: "bi-tag", cor: "#6D49F2" })).status, 409);
    const oldSlug=created.data.slug;
    const renamed=await api(`/categorias/${created.data.id}`, "PATCH", { nome: `${name} editada`, icone: "bi-tools", cor: "#7257E8" });
    assert.equal(renamed.status, 200);assert.equal(renamed.data.slug,oldSlug);
    const destination=await api("/categorias","POST",{nome:`Destino ${crypto.randomUUID().slice(0,8)}`,icone:"bi-box",cor:"#123ABC"});
    const archived=await prisma.itens.create({ data: { usuario_id: owner.id, categoria_id: created.data.id, titulo: "Arquivado na categoria", preco_por_dia: 10, valor_mercado: 100,arquivado:true } });
    const hidden=await prisma.itens.create({ data: { usuario_id: owner.id, categoria_id: created.data.id, titulo: "Oculto na categoria", preco_por_dia: 10, valor_mercado: 100,oculto_pelo_admin:true } });
    const rented=await prisma.itens.create({ data: { usuario_id: owner.id, categoria_id: created.data.id, titulo: "Alugado na categoria", preco_por_dia: 10, valor_mercado: 100 } });
    await prisma.alugueis.create({data:{item_id:rented.id,locador_id:owner.id,locatario_id:renter.id,data_inicio:new Date("2042-01-01"),data_fim:new Date("2042-01-02"),valor_total:10,status:"pago"}});
    const categories=await api("/categorias");
    assert.equal(categories.data.find((row:any)=>row.id===created.data.id).total_itens,3);
    const blocked=await api(`/categorias/${created.data.id}`, "DELETE");
    assert.equal(blocked.status,409);assert.equal(blocked.data.codigo,"categoria_com_itens");
    const moved=await api(`/categorias/${created.data.id}/mover-itens`,"POST",{destino_id:destination.data.id});
    assert.equal(moved.status,200);assert.equal(moved.data.movidos,3);
    assert.equal(await prisma.itens.count({where:{id:{in:[archived.id,hidden.id,rented.id]},categoria_id:destination.data.id}}),3);
    const categoriesAfter=await api("/categorias");
    assert.equal(categoriesAfter.data.find((row:any)=>row.id===created.data.id).total_itens,0);
    assert.equal(categoriesAfter.data.find((row:any)=>row.id===destination.data.id).total_itens,3);
    assert.equal((await api(`/categorias/${created.data.id}`, "DELETE")).status, 200);
    assert.equal(await prisma.admin_auditoria.count({ where: { entidade: "categoria", entidade_id: created.data.id } }), 4);

    const concurrentSource=await api("/categorias","POST",{nome:`Origem concorrente ${crypto.randomUUID().slice(0,8)}`,icone:"bi-box",cor:"#334455"});
    const concurrentDestination=await api("/categorias","POST",{nome:`Destino concorrente ${crypto.randomUUID().slice(0,8)}`,icone:"bi-box",cor:"#556677"});
    const existing=await prisma.itens.create({data:{usuario_id:owner.id,categoria_id:concurrentSource.data.id,titulo:"Existente concorrente",preco_por_dia:10,valor_mercado:100}});
    const [concurrentMove,newItem]=await Promise.all([
      api(`/categorias/${concurrentSource.data.id}/mover-itens`,"POST",{destino_id:concurrentDestination.data.id}),
      prisma.itens.create({data:{usuario_id:owner.id,categoria_id:concurrentSource.data.id,titulo:"Novo concorrente",preco_por_dia:10,valor_mercado:100}}),
    ]);
    assert.equal(concurrentMove.status,200,JSON.stringify(concurrentMove.data));
    const concurrentRows=await prisma.itens.findMany({where:{id:{in:[existing.id,newItem.id]}},select:{categoria_id:true}});
    assert.equal(concurrentRows.length,2);assert.ok(concurrentRows.every(row=>[concurrentSource.data.id,concurrentDestination.data.id].includes(row.categoria_id)));
    assert.equal(await prisma.itens.count({where:{id:existing.id,categoria_id:concurrentDestination.data.id}}),1);
  });
  await t.test("perfil conta anunciados sem incluir objetos arquivados",async()=>{
    const currentOwner=await prisma.usuarios.findUniqueOrThrow({where:{id:owner.id}});
    const expected=await prisma.itens.count({where:{usuario_id:owner.id,arquivado:false}});
    const profile=await publicApi("/usuarios/me",token(currentOwner));
    assert.equal(profile.status,200);assert.equal(profile.data.stats.anunciados,expected);
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
    assert.equal((await api("/pagamentos/estatisticas", "GET", undefined, token(renter))).status, 403);
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
