// Expõe leitura e envio de mensagens apenas para usuários autenticados.
import { Router } from "express";
import { listMessages, sendMessage } from "../controllers/messagesController.ts";
import { requireAuth } from "../middlewares/auth.ts";
import { rateLimit } from "../middlewares/rateLimit.ts";
const router = Router();
router.use(requireAuth);
router.get("/", listMessages);
router.post("/", rateLimit({ windowMs: 60_000, max: 30, scope: "chat-message" }), sendMessage);
export default router;
