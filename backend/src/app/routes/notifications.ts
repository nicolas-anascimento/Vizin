import { Router } from "express";
import { deleteNotification, listNotifications, markNotification } from "../controllers/notificationsController.ts";
import { requireAuth } from "../middlewares/auth.ts";
const router = Router();
router.use(requireAuth);
router.get("/", listNotifications);
router.patch("/:id", markNotification);
router.delete("/:id", deleteNotification);
export default router;
