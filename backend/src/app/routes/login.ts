import { Router } from "express";
import { login, logout, session } from "../controllers/authController.ts";
import { requireAuth } from "../middlewares/auth.ts";
import { rateLimit } from "../middlewares/rateLimit.ts";

const router = Router();
router.post("/", rateLimit({ windowMs: 15 * 60_000, max: 10 }), login);
router.post("/logout", logout);
router.get("/sessao", requireAuth, session);
export default router;
