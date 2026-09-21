// Expõe cartões do usuário autenticado, limitando tentativas de cadastro.
import { Router } from "express";
import { requireAuth } from "../middlewares/auth.ts";
import { rateLimit } from "../middlewares/rateLimit.ts";
import { listCards,addCard,defaultCard,deleteCard } from "../controllers/cardsController.ts";
const router=Router();router.use(requireAuth);
router.get("/",listCards);
router.post("/",rateLimit({windowMs:60000,max:20}),addCard);
router.patch("/:id/padrao",defaultCard);
router.delete("/:id",deleteCard);
export default router;
