// Expõe pagamento, consulta, cancelamento e estorno apenas para usuários autenticados.
import { Router } from "express";
import { requireAuth } from "../middlewares/auth.ts";
const router = Router();
router.use(requireAuth);
router.use((_req,res)=>res.status(410).json({success:false,codigo:"rota_financeira_descontinuada",message:"Pagamentos de aluguel e multa não são processados pelo VIZIN. Use /api/assinaturas para planos de publicação."}));
export default router;
