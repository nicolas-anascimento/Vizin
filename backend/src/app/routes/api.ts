import Express from "express";
import login from "./loginRoutes.ts";
import contas from "./accountRoutes.ts";
import usuarios from "./usuariosRoutes.ts";



const api = Express()

api.use("/login", login);
api.use("/contas", contas)
api.use("/usuarios", usuarios)

export default api;