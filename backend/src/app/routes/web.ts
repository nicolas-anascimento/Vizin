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
    res.sendFile(view("home"));
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

export default web;
