// Expõe conversas, mensagens, leitura, bloqueios e denúncias para usuários autenticados.
import { Router } from "express";
import * as c from "../controllers/conversationsController.ts";
import { report } from "../controllers/supportController.ts";
import { requireAuth } from "../middlewares/auth.ts";
const router=Router();router.use(requireAuth);
router.get("/",c.listConversations);router.post("/",c.createConversation);
router.get("/:id/messages",c.getConversationMessages);router.post("/:id/messages",c.sendConversationMessage);
router.post("/:id/read",c.readConversation);router.post("/:id/block",c.blockUser);
router.post("/:id/report",report);router.delete("/:id",c.archiveConversation);
export default router;
