import { expect, test, type Page } from "@playwright/test";
import bcrypt from "bcrypt";
import crypto from "node:crypto";
import pg from "pg";

const databaseUrl = process.env.TEST_DATABASE_URL;
if (!databaseUrl || !new URL(databaseUrl).pathname.startsWith("/vizin_contract_test_")) {
  throw new Error("TEST_DATABASE_URL isolado é obrigatório para o E2E");
}

const password = "Senha12345";
const suffix = crypto.randomUUID().slice(0, 8);
const userEmail = `e2e-user-${suffix}@test.local`;
const adminEmail = `e2e-admin-${suffix}@test.local`;
const title = `Furadeira E2E ${suffix}`;
const testNotificationTitle = `Teste admin E2E ${suffix}`;
let userCpf = "";
let adminCpf = "";
let adminId = "";
let itemId = "";

function cpf(): string {
  let value = String(crypto.randomInt(100_000_000, 999_999_999));
  for (const n of [9, 10]) {
    const sum = [...value].reduce((total, digit, index) => total + Number(digit) * (n + 1 - index), 0);
    value += String(((sum * 10) % 11) % 10);
  }
  return value;
}

async function query(text: string, values: unknown[] = []) {
  const client = new pg.Client({ connectionString: databaseUrl });
  await client.connect();
  try { return await client.query(text, values); }
  finally { await client.end(); }
}

async function login(page: Page, document: string) {
  await page.goto("/login");
  await page.locator("#loginCpf").fill(document);
  await page.locator("#loginSenha").fill(password);
  const response = page.waitForResponse(r => r.url().endsWith("/api/login") && r.request().method() === "POST");
  await page.locator("#loginForm button[type=submit]").click();
  expect((await response).status()).toBe(200);
}

test.describe.serial("frontend real conectado à API e ao PostgreSQL", () => {
  test.beforeAll(async () => {
    userCpf = cpf();
    do { adminCpf = cpf(); } while (adminCpf === userCpf);
    const passwordHash = await bcrypt.hash(password, 4);
    const inserted = await query(
      `insert into usuarios (nome, email, cpf, senha_hash, tipo)
       values ($1, $2, $3, $4, 'admin') returning id`,
      ["Admin E2E", adminEmail, adminCpf, passwordHash],
    );
    adminId = inserted.rows[0].id;
    await query(
      `insert into categorias (nome, slug, icone, cor)
       values ($1, $2, 'bi-tools', '#6D49F2') on conflict (slug) do nothing`,
      [`Ferramentas E2E ${suffix}`, `ferramentas-e2e-${suffix}`],
    );
  });

  test("cadastro pela interface envia contrato correto e persiste", async ({ page }) => {
    await page.goto("/cadastro");
    await page.locator("#registerNome").fill("Usuário E2E");
    await page.locator("#registerEmail").fill(userEmail);
    await page.locator("#btnStep1Next").click();
    await page.locator("#registerSenha").fill(password);
    await page.locator("#registerConfirmarSenha").fill(password);
    await page.locator("#btnStep2Next").click();
    await page.locator("#registerCpf").fill(userCpf);
    await page.locator("#registerWhatsapp").fill("11999999999");
    await page.locator("#registerAceitarTermos").check();
    const responsePromise = page.waitForResponse(r => r.url().endsWith("/api/usuarios") && r.request().method() === "POST");
    await page.locator("#cadastroForm button[type=submit]").click();
    const response = await responsePromise;
    expect(response.status()).toBe(201);
    await expect(page.locator("#registerErro")).toContainText("Conta criada com sucesso");
    const persisted = await query("select nome, email, cpf from usuarios where email=$1", [userEmail]);
    expect(persisted.rows).toEqual([{ nome: "Usuário E2E", email: userEmail, cpf: userCpf }]);
  });

  test("login e cadastro de anúncio atualizam a interface e persistem foto", async ({ page }) => {
    const pageErrors: string[] = [];
    page.on("pageerror", error => pageErrors.push(error.message));
    await login(page, userCpf);
    await page.waitForURL("**/home");
    await expect(page.locator("body")).toBeVisible();
    await page.goto("/cadastrar-objeto");
    await expect(page.locator("#categoria option")).not.toHaveCount(1);
    const category = await page.locator("#categoria option").nth(1).getAttribute("value");
    expect(category).toBeTruthy();
    await page.locator("#titulo").fill(title);
    await page.locator("#descricao").fill("Objeto criado por uma interação real do Playwright.");
    await page.locator("#categoria").selectOption(category!);
    await page.locator("#preco").fill("35.50");
    await page.locator("#localizacao").fill("São Paulo, SP");
    await page.locator("#photo-input").setInputFiles({
      name: "foto.png",
      mimeType: "image/png",
      buffer: Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+ip1sAAAAASUVORK5CYII=", "base64"),
    });
    const responsePromise = page.waitForResponse(r => r.url().endsWith("/api/objetos") && r.request().method() === "POST");
    await page.locator("#btn-submit").click();
    const response = await responsePromise;
    expect(response.status()).toBe(201);
    const payload = await response.json();
    itemId = payload.id;
    await page.waitForURL(new RegExp(`/produto\\?id=${payload.id}$`));
    await expect(page.locator("body")).toContainText(title);
    const persisted = await query(
      `select i.titulo, i.preco_por_dia::text preco, count(f.id)::int fotos
       from itens i left join fotos_item f on f.item_id=i.id
       where i.id=$1 group by i.id`,
      [payload.id],
    );
    expect(persisted.rows).toEqual([{ titulo: title, preco: "35.50", fotos: 1 }]);
    expect(pageErrors).toEqual([]);
  });

  test("endereço criado pela Minha Conta aparece e persiste", async ({ page }) => {
    await login(page, userCpf);
    await page.waitForURL("**/home");
    await page.goto("/minha-conta");
    await page.locator('[name="cep"]').fill("01001-000");
    await page.locator('[name="rua"]').fill("Praça da Sé");
    await page.locator('[name="numero"]').fill("1");
    await page.locator('[name="bairro"]').fill("Sé");
    await page.locator('[name="cidade"]').fill("São Paulo");
    await page.locator('[name="estado"]').fill("SP");
    await page.locator('[name="principal"]').check();
    const responsePromise = page.waitForResponse(r => r.url().endsWith("/api/enderecos") && r.request().method() === "POST");
    await page.locator("#endereco-form button[type=submit]").click();
    expect((await responsePromise).status()).toBe(201);
    await expect(page.locator("#enderecos-lista")).toContainText("Praça da Sé, 1");
    const persisted = await query(
      `select e.cep, e.rua, e.numero, e.cidade, e.estado, e.principal
       from enderecos e join usuarios u on u.id=e.usuario_id where u.email=$1`,
      [userEmail],
    );
    expect(persisted.rows).toEqual([{ cep: "01001000", rua: "Praça da Sé", numero: "1", cidade: "São Paulo", estado: "SP", principal: true }]);
  });

  test("comunicado de teste aparece somente na caixa do admin autenticado", async ({ page }) => {
    await login(page, adminCpf);
    await page.waitForURL("**/admin/inicio");
    await page.goto("/admin/notificacoes");
    await page.locator("#admnotTitulo").fill(testNotificationTitle);
    await page.locator("#admnotMensagem").fill("Mensagem exclusiva para o administrador autenticado.");
    const responsePromise = page.waitForResponse(r => r.url().endsWith("/api/admin/comunicados/teste") && r.request().method() === "POST");
    await page.locator("#btnTeste").click();
    expect((await responsePromise).status()).toBe(201);
    await expect(page.locator("#toast")).toContainText("Teste enviado");
    await page.goto("/admin/notificacoes-recebidas");
    await expect(page.locator("#listaNotificacoes")).toContainText(testNotificationTitle);
    const persisted = await query(
      `select destinatario_admin_id, count(*)::int total
       from notificacoes_admin where titulo=$1 group by destinatario_admin_id`,
      [testNotificationTitle],
    );
    expect(persisted.rows).toEqual([{ destinatario_admin_id: adminId, total: 1 }]);
  });

  test("páginas principais do usuário abrem sem exceções JavaScript", async ({ page }) => {
    await login(page, userCpf);
    await page.waitForURL("**/home");
    const errors: string[] = [];
    let current = "";
    page.on("pageerror", error => errors.push(`${current}: ${error.message}`));
    const routes = [
      "/home", "/perfil", "/minha-conta", "/alterar-senha", "/excluir-conta",
      "/preferencias", "/privacidade", "/verificacao", "/meus-objetos",
      "/cadastrar-objeto", `/produto?id=${itemId}`, `/editar-objeto?id=${itemId}`,
      "/notificacoes", "/historico", "/mensagens", "/suporte",
    ];
    for (const route of routes) {
      current = route;
      const response = await page.goto(route, { waitUntil: "domcontentloaded" });
      expect(response?.status(), route).toBe(200);
      await page.waitForTimeout(350);
    }
    expect(errors).toEqual([]);
  });

  test("páginas principais do admin abrem sem exceções JavaScript", async ({ page }) => {
    await login(page, adminCpf);
    await page.waitForURL("**/admin/inicio");
    const errors: string[] = [];
    let current = "";
    page.on("pageerror", error => errors.push(`${current}: ${error.message}`));
    const routes = [
      "/admin/inicio", "/admin/usuarios", `/admin/usuarios/detalhe?id=${adminId}`,
      "/admin/objetos", "/admin/pagamentos", "/admin/avaliacoes", "/admin/denuncias",
      "/admin/categorias", "/admin/notificacoes", "/admin/notificacoes-recebidas",
      "/admin/auditoria", "/admin/configuracoes", "/admin/verificacoes",
    ];
    for (const route of routes) {
      current = route;
      const response = await page.goto(route, { waitUntil: "domcontentloaded" });
      expect(response?.status(), route).toBe(200);
      await page.waitForTimeout(350);
    }
    expect(errors).toEqual([]);
  });
});
