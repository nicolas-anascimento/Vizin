import { Router } from "express";
import { confirmPix, generatePix, payCard } from "../controllers/paymentsController.ts";
import { requireAuth } from "../middlewares/auth.ts";
const router = Router();
router.use(requireAuth);
router.post("/pix/gerar", generatePix);
router.post("/pix/confirmar", confirmPix);
router.post("/cartao", payCard);
export default router;
