// Expõe recuperação e redefinição de senha com limites de tentativa por rota.
import { Router } from "express";
import { requestResetPassword, resetPassword } from "../controllers/accountsController.ts";
import { rateLimit } from "../middlewares/rateLimit.ts";
const router = Router();
router.post("/recuperar-senha", rateLimit({ windowMs: 60 * 60_000, max: 5 }), requestResetPassword);
router.post("/resetar-senha", rateLimit({ windowMs: 15 * 60_000, max: 10 }), resetPassword);
export default router;
