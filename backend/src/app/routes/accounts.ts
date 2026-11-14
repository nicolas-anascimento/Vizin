// Expõe recuperação e redefinição de senha com limites de tentativa por rota.
import { Router } from "express";
import { requestResetPassword, resetPassword, validateResetToken } from "../controllers/accountsController.ts";
import { rateLimit } from "../middlewares/rateLimit.ts";
import { createHash } from "node:crypto";
import { validate } from "../middlewares/validate.ts";
import { recoverySchema } from "../schemas/auth.schema.ts";
const router = Router();
router.post("/recuperar-senha", rateLimit({ windowMs: 60 * 60_000, max: 5, identity: "ip", scope: "password-recovery" }), rateLimit({ windowMs: 60 * 60_000, max: 5, scope: "password-recovery-account", keyGenerator: req => typeof req.body?.email === "string" ? createHash("sha256").update(req.body.email.trim().toLowerCase()).digest("hex") : null }), validate({ body: recoverySchema }), requestResetPassword);
router.post("/resetar-senha", rateLimit({ windowMs: 15 * 60_000, max: 10, identity: "ip", scope: "password-reset" }), resetPassword);
router.post("/validar-token-senha", rateLimit({ windowMs: 15 * 60_000, max: 20, identity: "ip", scope: "password-reset-validation" }), validateResetToken);
export default router;
