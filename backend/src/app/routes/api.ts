import Express from "express";
import login from "./loginRoutes.ts";


const api = Express()

api.use("/login", login);

export default api;