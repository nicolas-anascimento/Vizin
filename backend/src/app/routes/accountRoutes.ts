import Express from "express";
import AccountController from "../controllers/accountsController.ts";

const accountsRoutes = Express();

accountsRoutes.post("/reset-password", AccountController.requestResetPassword);

export default accountsRoutes;
