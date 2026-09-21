// Expõe lista, contagem não lida, leitura e exclusão das notificações do usuário.
import prisma from "../config/database.ts";
import { Router } from "express";
import { deleteNotification, listNotifications, markNotification, unreadCount } from "../controllers/notificationsController.ts";
import { requireAuth } from "../middlewares/auth.ts";
const router = Router();
router.use(requireAuth);
router.get("/", listNotifications);
router.get("/nao-lidas/contagem", unreadCount);
// Ambas as variantes de método marcam apenas as notificações do próprio usuário como lidas.
router.patch("/ler-todas", async (req, res) => { await prisma.notificacoes.updateMany({ where: { usuario_id: req.user!.id }, data: { lida: true } }); res.json({ success: true }); });
router.post("/ler-todas", async (req, res) => { await prisma.notificacoes.updateMany({ where: { usuario_id: req.user!.id }, data: { lida: true } }); res.json({ success: true }); });
router.patch("/:id", markNotification);
router.delete("/:id", deleteNotification);
export default router;
