import Express from "express";
import login from "./loginRoutes.ts";
import _contas from "./accountRoutes.ts";



const api = Express()

api.use("/login", login);
// api.use("/account", contas)

export default api;