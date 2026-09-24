// Expõe login com limite de tentativas, logout e consulta da sessão autenticada.
import { Router } from "express";
import { login, logout, session } from "../controllers/authController.ts";
import { requireAuth } from "../middlewares/auth.ts";
import { getLoginAccountRateLimitKey, rateLimit } from "../middlewares/rateLimit.ts";

const router = Router();
router.post(
  "/",
  rateLimit({ windowMs: 15 * 60_000, max: 10, identity: "ip", scope: "login-ip" }),
  rateLimit({ windowMs: 15 * 60_000, max: 10, scope: "login-account", keyGenerator: getLoginAccountRateLimitKey }),
  login,
);
router.post("/logout", logout);
router.get("/sessao", requireAuth, session);
export default router;
