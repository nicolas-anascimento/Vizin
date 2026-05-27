import path from "path";
import Express from "express";
import isAdmin from "../middlewares/isAdmin.ts";

const web = Express();

function view(view: String) {
    return path.resolve(`../frontend/${view}`);
}

web.get("/", (_req, res) => {
    res.sendFile(view("login.html"))
})
web.get("/login", (_req, res) => {
    res.sendFile(view("login.html"))
})
web.get("/home", (_req, res) => {
    res.sendFile(view("home.html"))
})
web.get("/admin", isAdmin, (_req, res) => {
    res.sendFile("dashboard-admin.html")
})
web.get("/objetos", (_req, res) => {
    res.sendFile(view("meusobjetos.html"));
})


export default web;