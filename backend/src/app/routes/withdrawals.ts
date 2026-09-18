import { Router } from "express";
import { recordHandover, handoverStatus } from "../controllers/handoverController.ts";
import { requireAuth } from "../middlewares/auth.ts";
import { withdrawalUpload } from "../middlewares/upload.ts";
import { verifyUploads } from "../middlewares/privateUpload.ts";
export function handoverRouter(returning: boolean) {
 const router = Router(); router.use(requireAuth);
 router.get("/:aluguelId/status", handoverStatus(returning));
 router.post("/:aluguelId/fotos", withdrawalUpload, verifyUploads, recordHandover(returning));
 router.post("/fotos", withdrawalUpload, verifyUploads, recordHandover(returning));
 router.post("/", withdrawalUpload, verifyUploads, recordHandover(returning));
 return router;
}
export default handoverRouter(false);
