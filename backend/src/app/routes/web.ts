import path from "node:path";
import { fileURLToPath } from "node:url";
import { Router, type RequestHandler } from "express";
import { requireAdminPage, requireAuthPage } from "../middlewares/auth.ts";

const router = Router();
const here = path.dirname(fileURLToPath(import.meta.url));
const frontendRoot = path.resolve(here, "../../../../frontend");
const view = (folder: string) => path.join(frontendRoot, folder, "index.html");

const guestOrHome: RequestHandler = (req, res) => {
  if (req.user) {
    res.redirect(req.user.tipo === "admin" ? "/admin" : "/home");
    return;
  }
  res.sendFile(view("Login"));
};

router.get("/", guestOrHome);
router.get("/login", guestOrHome);
router.get("/recuperar-senha", (_req, res) => res.sendFile(view("Recuperar-senha")));
router.get("/resetar-senha", (_req, res) => res.sendFile(view("Resetar-senha")));
router.get("/home", requireAuthPage, (_req, res) => res.sendFile(view("Inicio")));
router.get("/admin", requireAdminPage, (_req, res) => res.sendFile(view("Dashboard-admin")));
router.get("/objetos", requireAuthPage, (_req, res) => res.sendFile(view("Meus-objetos")));
router.get("/cadastrar-objeto", requireAuthPage, (_req, res) => res.sendFile(view("Cadastrar-objeto")));
router.get("/editar-objeto", requireAuthPage, (_req, res) => res.sendFile(view("Editar-objeto")));
router.get("/finalizar-pagamento", requireAuthPage, (_req, res) => res.sendFile(view("Finalizar-pagamento")));
router.get("/pagamento-confirmado", requireAuthPage, (_req, res) => res.sendFile(view("Pagamento-confirmado")));
router.get("/notificacoes", requireAuthPage, (_req, res) => res.sendFile(view("Notificacoes")));
router.get("/perfil", requireAuthPage, (_req, res) => res.sendFile(view("Perfil")));
router.get("/produto", requireAuthPage, (_req, res) => res.sendFile(view("Produto")));
router.get("/retirada-objeto", requireAuthPage, (_req, res) => res.sendFile(view("Retirada-objeto")));
export default router;
