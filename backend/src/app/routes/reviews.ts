// Expõe criação de avaliação somente após autenticação.
import { Router } from "express";
import { createReview } from "../controllers/reviewsController.ts";
import { requireAuth } from "../middlewares/auth.ts";
import { validate } from "../middlewares/validate.ts";
import { reviewBodySchema } from "../schemas/reviews.schema.ts";
const router = Router();
router.post("/", requireAuth, validate({ body: reviewBodySchema }), createReview);
export default router;
