// Expõe conversas, mensagens, leitura, bloqueios e denúncias para usuários autenticados.
import { Router } from "express";
import { validate } from "../middlewares/validate.ts";
import { idParamsSchema } from "../schemas/common.ts";
import { createConversationSchema, sendConversationMessageSchema } from "../schemas/conversations.schema.ts";
import * as c from "../controllers/conversationsController.ts";
import { report } from "../controllers/supportController.ts";
import { requireAuth } from "../middlewares/auth.ts";
import { rateLimit } from "../middlewares/rateLimit.ts";
const router=Router();router.use(requireAuth);
router.get("/",c.listConversations);router.post("/",validate({body:createConversationSchema}),c.createConversation);
router.get("/:id/messages",validate({params:idParamsSchema}),c.getConversationMessages);router.post("/:id/messages",rateLimit({windowMs:60_000,max:30,scope:"chat-message"}),validate({params:idParamsSchema,body:sendConversationMessageSchema}),c.sendConversationMessage);
router.post("/:id/read",validate({params:idParamsSchema}),c.readConversation);router.post("/:id/block",validate({params:idParamsSchema}),c.blockUser);
router.post("/:id/report",validate({params:idParamsSchema}),report);router.delete("/:id",validate({params:idParamsSchema}),c.archiveConversation);
export default router;
