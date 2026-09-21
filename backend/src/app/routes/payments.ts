// Expõe pagamento, consulta, cancelamento e estorno apenas para usuários autenticados.
import { Router } from "express";
import { confirmPix, generatePix, payCard, paymentStatus, refundPayment, cancelPayment, simulatePayment } from "../controllers/paymentsController.ts";
import { requireAuth } from "../middlewares/auth.ts";
const router = Router();
router.use(requireAuth);
router.post("/pix/gerar", generatePix);
router.post("/pix/confirmar", confirmPix);
router.post("/cartao", payCard);
router.get("/:id/status", paymentStatus);
router.get("/:id", paymentStatus);
router.post("/:id/estornar", refundPayment);
router.post("/:id/cancelar", cancelPayment);
router.post("/:id/simular", simulatePayment);
export default router;
