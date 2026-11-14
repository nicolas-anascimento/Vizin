import assert from "node:assert/strict";
import test from "node:test";
import type { AddressInfo } from "node:net";

process.env.VIZIN_NO_LISTEN = "true";

test("páginas públicas, assets e link de alteração de e-mail respondem por HTTP", async t => {
  const entry = process.env.WEB_TEST_BUILD === "true" ? "../../../dist/app.js" : "../../app.ts";
  const { default: app } = await import(entry) as typeof import("../../app.ts");
  const server = app.listen(0, "127.0.0.1");
  await new Promise<void>((resolve, reject) => {
    server.once("listening", resolve);
    server.once("error", reject);
  });
  t.after(() => new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve())));
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;

  const landing = await fetch(base + "/");
  assert.equal(landing.status, 200);
  assert.match(landing.headers.get("content-type") ?? "", /text\/html/);
  const landingHtml = await landing.text();
  assert.match(landingHtml, /Vizin — alugue/);
  assert.match(landingHtml, /href="\/cadastro\?plano=intermediario"/);
  assert.match(landingHtml, /href="\/cadastro\?plano=avancado"/);
  assert.match(landingHtml, /bootstrap-icons/);
  assert.match(landingHtml, /\/assets\/usuario\/img\/logo\.png/);

  const css = await fetch(base + "/assets/landing-page/landing.css");
  assert.equal(css.status, 200);
  assert.match(css.headers.get("content-type") ?? "", /text\/css/);
  assert.ok((await css.text()).length > 100);
  for (const path of ["/assets/usuario/img/logo.png", "/assets/usuario/Confirmar-email/confirmar-email.js"]) {
    assert.equal((await fetch(base + path)).status, 200, path);
  }

  const confirmation = await fetch(base + "/confirmar-email?token=invalid");
  assert.equal(confirmation.status, 200);
  assert.match(confirmation.headers.get("content-type") ?? "", /text\/html/);
  assert.match(await confirmation.text(), /confirmar-email\.js/);

  const token = "a".repeat(64);
  const link = await fetch(base + `/api/usuarios/email/confirmar?token=${token}`, { redirect: "manual" });
  assert.equal(link.status, 303);
  assert.equal(link.headers.get("location"), `/confirmar-email?tipo=alteracao&token=${token}`);
  assert.equal((await fetch(base + "/api/saude")).status, 200);
});
