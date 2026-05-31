import Express from "express";
import AccountController from "../controllers/accountsController.ts";

const accountsRoutes = Express();

accountsRoutes.post("/recuperar-senha", AccountController.requestResetPassword);
accountsRoutes.post("/resetar-senha", AccountController.resetPassword);

export default accountsRoutes;
