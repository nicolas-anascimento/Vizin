import { Router } from "express";
import { createWithdrawal } from "../controllers/withdrawalsController.ts";
import { requireAuth } from "../middlewares/auth.ts";
import { withdrawalUpload } from "../middlewares/upload.ts";
const router = Router();
router.post("/", requireAuth, withdrawalUpload, createWithdrawal);
export default router;
