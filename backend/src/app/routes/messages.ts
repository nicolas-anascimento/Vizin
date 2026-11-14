// Expõe leitura e envio de mensagens apenas para usuários autenticados.
import { Router } from "express";
import { validate } from "../middlewares/validate.ts";
import { messagesQuerySchema, sendMessageSchema } from "../schemas/messages.schema.ts";
import { listMessages, sendMessage } from "../controllers/messagesController.ts";
import { requireAuth } from "../middlewares/auth.ts";
import { rateLimit } from "../middlewares/rateLimit.ts";
const router = Router();
router.use(requireAuth);
router.get("/", validate({ query: messagesQuerySchema }), listMessages);
router.post("/", rateLimit({ windowMs: 60_000, max: 30, scope: "chat-message" }), validate({ body: sendMessageSchema }), sendMessage);
export default router;
