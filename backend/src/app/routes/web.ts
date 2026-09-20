// Associa URLs de páginas aos mocks estáticos e aplica autenticação nas telas privadas.
import { Router, type RequestHandler } from "express";
import { requireAdminPage, requireAuthPage } from "../middlewares/auth.ts";

const router = Router();
const view = (folder: string) => `/assets/${folder}/index.html`;

const guestOrHome: RequestHandler = (req, res) => {
  if (req.user) {
    res.redirect(req.user.tipo === "admin" ? "/admin" : "/home");
    return;
  }
  res.redirect(view("Login"));
};

router.get("/", guestOrHome);
router.get("/login", guestOrHome);
router.get("/recuperar-senha", (_req, res) => res.redirect(view("Recuperar-senha")));
router.get("/resetar-senha", (_req, res) => res.redirect(view("Resetar-senha")));
router.get("/home", requireAuthPage, (_req, res) => res.redirect(view("Inicio")));
router.get("/admin", requireAdminPage, (_req, res) => res.redirect(view("Dashboard-admin")));
router.get("/objetos", requireAuthPage, (_req, res) => res.redirect(view("Meus-objetos")));
router.get("/cadastrar-objeto", requireAuthPage, (_req, res) => res.redirect(view("Cadastrar-objeto")));
router.get("/editar-objeto", requireAuthPage, (_req, res) => res.redirect(view("Editar-objeto")));
router.get("/finalizar-pagamento", requireAuthPage, (_req, res) => res.redirect(view("Finalizar-pagamento")));
router.get("/pagamento-confirmado", requireAuthPage, (_req, res) => res.redirect(view("Pagamento-confirmado")));
router.get("/notificacoes", requireAuthPage, (_req, res) => res.redirect(view("Notificacoes")));
router.get("/perfil", requireAuthPage, (_req, res) => res.redirect(view("Perfil")));
router.get("/produto", requireAuthPage, (_req, res) => res.redirect(view("Produto")));
router.get("/retirada-objeto", requireAuthPage, (_req, res) => res.redirect(view("Retirada-objeto")));
for (const [route, folder] of Object.entries({"/minha-conta":"Minha-conta","/alterar-senha":"Alterar-senha","/excluir-conta":"Excluir-conta","/preferencias":"Preferencias","/privacidade":"Privacidade","/verificacao-da-conta":"Verificacao-da-conta","/historico":"Historico","/mensagens":"Mensagens","/suporte":"Suporte","/status-locacao":"Status-locacao","/devolucao-objeto":"Devolucao-objeto","/avaliacao":"Avaliacao","/forma-de-pagamento":"Forma-de-pagamento"})) router.get(route, requireAuthPage, (_req,res)=>res.redirect(view(folder)));
export default router;
