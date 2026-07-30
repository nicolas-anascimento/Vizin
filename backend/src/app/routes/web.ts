import path from "path";
import Express from "express";
import isAdmin from "../middlewares/isAdmin.ts";
import prisma from "../config/database.ts";
import { createHash } from "crypto";

const web = Express();

function view(view: String) {
  return path.resolve(`../frontend/${view}/index.html`);
}

web.get("/", (_req, res) => {
  res.sendFile(view("login"));
});
web.get("/login", (_req, res) => {
  res.sendFile(view("login"));
});
web.get("/home", (_req, res) => {
  res.sendFile(view("inicio"));
});
web.get("/admin", isAdmin, (_req, res) => {
  res.sendFile(view("dashboard-admin"));
});
web.get("/objetos", (_req, res) => {
  res.sendFile(view("meusobjetos"));
});

web.get("/recuperar-senha", (_req, res) => {
  res.sendFile(view("recuperar-senha"));
});

web.get("/resetar-senha", async (req, res) => {
  const token = req.query.token as string;

  const resetRequest = await prisma.resetar_Senha.findUnique({
    where: {
      token: createHash("sha256").update(token).digest("hex"),
    },
  });

  if (!resetRequest || resetRequest.expire_in < new Date()) {
    res.redirect("/?error=invalid-token");
    return;
  }

  res.sendFile(view("resetar-senha"));
});

web.get("/cadastrar-objeto", (_req, res) => {
  res.sendFile(view("Cadastrar-objeto"));
});

web.get("/editar-objeto", (_req, res) => {
  res.sendFile(view("Editar-objeto"));
});

web.get("/finalizar-pagamento", (_req, res) => {
  res.sendFile(view("Finalizar-pagamento"));
});

web.get("/notificacoes", (_req, res) => {
  res.sendFile(view("Notificacoes"));
});

web.get("/perfil", (_req, res) => {
  res.sendFile(view("Perfil"));
});

web.get("/produto", (_req, res) => {
  res.sendFile(view("Produto"));
});

web.get("/retirada-objeto", (_req, res) => {
  res.sendFile(view("Retirada-objeto"));
});

export default web;
