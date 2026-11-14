import { Router } from "express";
import { requireAuth } from "../middlewares/auth.ts";
import { rateLimit } from "../middlewares/rateLimit.ts";
import { cancelSubscription, createSubscription, getSubscription, listPlans, myPublications, mySubscription, subscriptionPayment } from "../controllers/subscriptionsController.ts";
import { validate } from "../middlewares/validate.ts";
import { idParamsSchema } from "../schemas/common.ts";
import { subscriptionBodySchema } from "../schemas/subscriptions.schema.ts";

const router = Router();
router.get("/planos", listPlans);
router.get("/usuarios/me/assinatura", requireAuth, mySubscription);
router.get("/usuarios/me/publicacoes", requireAuth, myPublications);
router.post("/assinaturas", requireAuth, rateLimit({ windowMs: 60000, max: 10 }), validate({ body: subscriptionBodySchema }), createSubscription);
router.get("/assinaturas/:id", requireAuth, validate({ params: idParamsSchema }), getSubscription);
router.post("/assinaturas/:id/cancelar", requireAuth, validate({ params: idParamsSchema }), cancelSubscription);
router.get("/pagamentos-assinatura/:id", requireAuth, validate({ params: idParamsSchema }), subscriptionPayment);
export default router;
