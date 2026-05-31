import Express from "express";
import login from "./loginRoutes.ts";
import contas from "./accountRoutes.ts";



const api = Express()

api.use("/login", login);
api.use("/contas", contas)

export default api;