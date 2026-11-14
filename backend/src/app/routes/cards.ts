// Expõe cartões do usuário autenticado, limitando tentativas de cadastro.
import { Router } from "express";
import { requireAuth } from "../middlewares/auth.ts";
import { rateLimit } from "../middlewares/rateLimit.ts";
import { listCards,addCard,defaultCard,deleteCard } from "../controllers/cardsController.ts";
import type { RequestHandler } from "express";
import { rejectCardSecrets } from "../services/paymentRules.ts";
import { validate } from "../middlewares/validate.ts";
import { cardIdParamsSchema, cardTokenSchema } from "../schemas/cards.schema.ts";
const rejectSecrets: RequestHandler = (req, _res, next) => {
 try { rejectCardSecrets(req.body); next(); } catch (error) { next(error); }
};
const router=Router();router.use(requireAuth);
router.get("/",listCards);
router.post("/",rateLimit({windowMs:60000,max:20}),rejectSecrets,validate({body:cardTokenSchema}),addCard);
router.patch("/:id/padrao",validate({params:cardIdParamsSchema}),defaultCard);
router.delete("/:id",validate({params:cardIdParamsSchema}),deleteCard);
export default router;
