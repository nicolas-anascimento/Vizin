import Express from "express";
import AccountController from "../controllers/accountsController.ts";

const accountsRoutes = Express();

accountsRoutes.post("/resetar-senha", AccountController.requestResetPassword);

export default accountsRoutes;
