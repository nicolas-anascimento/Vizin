// Rotas de navegação do frontend. A API continua exclusivamente sob /api.
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Router, type RequestHandler } from "express";
import { requireAdminPage, requireAuthPage } from "../middlewares/auth.ts";

const router = Router();
const frontendPath = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../../../frontend",
);

const sendFrontendFile = (...segments: string[]): RequestHandler =>
  (_req, res) => res.sendFile(path.join(frontendPath, ...segments));

const userPage = (folder: string, file = "index.html") =>
  sendFrontendFile("usuario", folder, file);
const adminPage = (folder: string) =>
  sendFrontendFile("admin", folder, "index.html");

const loginPage = userPage("Login");
const guestOrHome: RequestHandler = (req, res, next) => {
  if (req.user) {
    if (req.query.next === "/suporte") {
      res.redirect("/suporte");
      return;
    }
    const plan = req.query.plano;
    if (req.user.tipo !== "admin" && (plan === "intermediario" || plan === "avancado")) {
      res.redirect(`/finalizar-pagamento?plano=${plan}`);
      return;
    }
    res.redirect(req.user.tipo === "admin" ? "/admin" : "/home");
    return;
  }
  loginPage(req, res, next);
};

// A URL principal sempre entrega a Landing Page, independentemente da sessão.
router.get("/", sendFrontendFile("landing-page", "index.html"));
router.get("/login", guestOrHome);
router.get("/cadastro", guestOrHome);
router.get(
  "/recuperar-senha",
  userPage("Recuperar-senha", "Recuperar-senha-index.html"),
);
router.get(
  "/resetar-senha",
  userPage("Resetar-senha", "Resetar-senha-index.html"),
);
router.get("/confirmar-email", userPage("Confirmar-email"));
router.get("/termos", userPage("Termos"));
router.get("/politica-de-privacidade", userPage("Politica-de-privacidade"));
router.get("/planos", requireAuthPage, userPage("Planos"));

// Fragmentos de layout também ficam fora de /assets, que serve apenas arquivos estáticos.
router.get("/partials/header", sendFrontendFile("usuario", "header", "index.html"));
router.get("/partials/footer", sendFrontendFile("usuario", "footer", "index.html"));
router.get(
  "/partials/admin-sidebar",
  requireAdminPage,
  sendFrontendFile("admin", "admin-sidebar", "index.html"),
);

// Páginas autenticadas. Os aliases preservam URLs já publicadas.
const authenticatedPages: Record<string, RequestHandler> = {
  "/inicio": userPage("Inicio"),
  "/home": userPage("Inicio"),
  "/produto": userPage("Produto"),
  "/perfil": userPage("Perfil"),
  "/minha-conta": userPage("Minha-conta"),
  "/alterar-senha": userPage("Alterar-senha"),
  "/excluir-conta": userPage("Excluir-conta"),
  "/preferencias": userPage("Preferencias"),
  "/privacidade": userPage("Privacidade"),
  "/verificacao": userPage("Verificacao-da-conta"),
  "/verificacao-da-conta": userPage("Verificacao-da-conta"),
  "/meus-objetos": userPage("Meus-objetos"),
  "/objetos": userPage("Meus-objetos"),
  "/cadastrar-objeto": userPage("Cadastrar-objeto"),
  "/editar-objeto": userPage("Editar-objeto"),
  "/notificacoes": userPage("Notificacoes"),
  "/historico": userPage("Historico"),
  "/status-locacao": userPage("Status-locacao"),
  "/retirada": userPage("Retirada-objeto"),
  "/retirada-objeto": userPage("Retirada-objeto"),
  "/devolucao": userPage("Devolucao-objeto"),
  "/devolucao-objeto": userPage("Devolucao-objeto"),
  "/avaliacao": userPage("Avaliacao"),
  "/mensagens": userPage("Mensagens"),
  "/suporte": userPage("Suporte"),
  "/finalizar-pagamento": userPage("Finalizar-pagamento"),
  "/pagamento-confirmado": userPage("Pagamento-confirmado"),
};

for (const [route, page] of Object.entries(authenticatedPages)) {
  router.get(route, requireAuthPage, page);
}
router.get("/pagamento-multa", requireAuthPage, (_req,res)=>res.redirect("/historico?aviso=multas-descontinuadas"));

// Páginas administrativas existentes.
const adminPages: Record<string, RequestHandler> = {
  "/admin/inicio": adminPage("Inicio"),
  "/admin/usuarios": adminPage("Usuarios"),
  "/admin/usuarios/detalhe": adminPage("Detalhes-do-usuario"),
  "/admin/objetos": adminPage("Anuncios"),
  "/admin/pagamentos": adminPage("Pagamentos"),
  "/admin/avaliacoes": adminPage("Avaliacoes"),
  "/admin/denuncias": adminPage("Denuncias"),
  "/admin/categorias": adminPage("Categorias"),
  "/admin/notificacoes": adminPage("Notificacoes"),
  "/admin/notificacoes-recebidas": adminPage("Notificações-recebidas"),
  "/admin/auditoria": adminPage("Auditoria"),
  "/admin/configuracoes": adminPage("Configuracoes"),
  "/admin/verificacoes": adminPage("Verificacoes"),
  "/admin/verificacoes/analise": adminPage("Analise-verificacao"),
};

router.get("/admin", requireAdminPage, (_req,res)=>res.redirect("/admin/inicio"));

for (const [route, page] of Object.entries(adminPages)) {
  router.get(route, requireAdminPage, page);
}

export default router;
