import { Router } from "express";
import { listMessages, sendMessage } from "../controllers/messagesController.ts";
import { requireAuth } from "../middlewares/auth.ts";
const router = Router();
router.use(requireAuth);
router.get("/", listMessages);
router.post("/", sendMessage);
export default router;
