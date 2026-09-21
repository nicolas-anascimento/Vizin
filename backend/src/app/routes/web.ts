// Rotas de navegação do frontend. A API continua exclusivamente sob /api.
import { Router, type RequestHandler } from "express";
import { requireAdminPage, requireAuthPage } from "../middlewares/auth.ts";

const router = Router();
const userView = (folder: string, file = "index.html") =>
  `/assets/usuario/${folder}/${file}`;
const adminView = (folder: string) => `/assets/admin/${folder}/index.html`;

function withQuery(req: Parameters<RequestHandler>[0], target: string): string {
  const query = req.originalUrl.split("?")[1];
  if (!query) return target;
  return `${target}${target.includes("?") ? "&" : "?"}${query}`;
}

const redirectTo = (target: string): RequestHandler => (req, res) =>
  res.redirect(withQuery(req, target));

const guestOrHome: RequestHandler = (req, res) => {
  if (req.user) {
    res.redirect(req.user.tipo === "admin" ? "/admin" : "/inicio");
    return;
  }
  res.redirect(withQuery(req, userView("Login")));
};

// Páginas públicas.
router.get("/", guestOrHome);
router.get("/login", guestOrHome);
router.get("/cadastro", (req, res) =>
  res.redirect(withQuery(req, `${userView("Login")}?cadastro=1`)),
);
router.get(
  "/recuperar-senha",
  redirectTo(userView("Recuperar-senha", "Recuperar-senha-index.html")),
);
router.get(
  "/resetar-senha",
  redirectTo(userView("Resetar-senha", "Resetar-senha-index.html")),
);
router.get("/termos", redirectTo(userView("Termos")));
router.get(
  "/politica-de-privacidade",
  redirectTo(userView("Politica-de-privacidade")),
);

// Páginas autenticadas. Os aliases preservam URLs já publicadas.
const authenticatedPages: Record<string, string> = {
  "/inicio": userView("Inicio"),
  "/home": userView("Inicio"),
  "/produto": userView("Produto"),
  "/perfil": userView("Perfil"),
  "/minha-conta": userView("Minha-conta"),
  "/alterar-senha": userView("Alterar-senha.js"),
  "/excluir-conta": userView("Excluir-conta"),
  "/preferencias": userView("Preferencias"),
  "/privacidade": userView("Privacidade"),
  "/verificacao": userView("Verificacao-da-conta"),
  "/verificacao-da-conta": userView("Verificacao-da-conta"),
  "/meus-objetos": userView("Meus-objetos"),
  "/objetos": userView("Meus-objetos"),
  "/cadastrar-objeto": userView("Cadastrar-objeto"),
  "/editar-objeto": userView("Editar-objeto"),
  "/notificacoes": userView("Notificacoes"),
  "/historico": userView("Historico"),
  "/status-locacao": userView("Status-locacao"),
  "/retirada": userView("Retirada-objeto"),
  "/retirada-objeto": userView("Retirada-objeto"),
  "/devolucao": userView("Devolucao-objeto"),
  "/devolucao-objeto": userView("Devolucao-objeto"),
  "/avaliacao": userView("Avaliacao"),
  "/mensagens": userView("Mensagens"),
  "/suporte": userView("Suporte"),
  "/finalizar-pagamento": userView("Finalizar-pagamento"),
  "/pagamento-confirmado": userView("Pagamento-confirmado"),
  "/pagamento-multa": userView("Pagamento-multa"),
  "/formas-de-pagamento": userView("Forma-de pagamento"),
  "/forma-de-pagamento": userView("Forma-de pagamento"),
};

for (const [route, target] of Object.entries(authenticatedPages)) {
  router.get(route, requireAuthPage, redirectTo(target));
}

// Páginas administrativas existentes.
const adminPages: Record<string, string> = {
  "/admin": adminView("Usuarios"),
  "/admin/usuarios": adminView("Usuarios"),
  "/admin/usuarios/detalhe": adminView("Detalhes-do-usuario"),
  "/admin/usuarios/editar": adminView("Editar-usuario"),
  "/admin/objetos": adminView("Anuncios"),
};

for (const [route, target] of Object.entries(adminPages)) {
  router.get(route, requireAdminPage, redirectTo(target));
}

export default router;
