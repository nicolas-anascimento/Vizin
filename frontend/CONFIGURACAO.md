# Configuração pública do checkout

## API e origens

O cliente central usa `API_URL: "/api"` em `usuario/utils/config.js`. Esse valor atende a entrega recomendada, em que frontend e backend usam a mesma origem. Para uma implantação separada, altere somente esse arquivo para a origem pública do backend e inclua a origem do frontend em `FRONTEND_ORIGINS` no backend. Não inclua tokens ou segredos na URL.

No backend, `APP_URL` identifica a origem publicada e `FRONTEND_ORIGINS` aceita a lista explícita de origens permitidas. Cookies entre origens exigem HTTPS e a configuração correspondente de `COOKIE_SAME_SITE`.

## Mercado Pago

Antes de `usuario/utils/config.js`, o deploy pode definir:

```html
<script>window.VIZIN_PUBLIC_CONFIG = { MP_PUBLIC_KEY: "APP_USR-..." };</script>
```

Use a **public key** do Mercado Pago do ambiente correspondente. O access token permanece exclusivamente no backend. Sem `MP_PUBLIC_KEY`, a interface de cartão mostra uma mensagem de indisponibilidade; PIX segue o contrato do backend. A homologação do gateway, incluindo 3DS e repasses, continua sendo uma pendência externa.

O backend serve o pacote atualizado em `/assets/usuario/` e `/assets/admin/`; as rotas web redirecionam para esses caminhos. Mantenha frontend e API na mesma origem para usar o cookie HttpOnly sem configuração CORS adicional.

## Navegação

Links e redirecionamentos do frontend usam as rotas web canônicas, preservando parâmetros de consulta:

- públicas: `/login`, `/cadastro`, `/recuperar-senha`, `/resetar-senha`, `/termos` e `/politica-de-privacidade`;
- usuário: `/inicio`, `/produto`, `/perfil`, `/minha-conta`, `/meus-objetos`, `/historico`, `/notificacoes`, `/mensagens`, `/suporte` e as rotas específicas dos fluxos de locação e pagamento;
- administração: `/admin`, `/admin/usuarios`, `/admin/usuarios/detalhe`, `/admin/usuarios/editar` e `/admin/objetos`.

Os caminhos `/assets/...` são usados somente para arquivos estáticos e como destino interno dos redirecionamentos feitos pelo Express.
