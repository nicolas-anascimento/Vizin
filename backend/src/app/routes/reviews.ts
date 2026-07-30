import { Router } from "express";
import { createReview } from "../controllers/reviewsController.ts";
import { requireAuth } from "../middlewares/auth.ts";
const router = Router();
router.post("/", requireAuth, createReview);
export default router;
