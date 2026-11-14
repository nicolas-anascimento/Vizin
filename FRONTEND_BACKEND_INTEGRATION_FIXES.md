# Correções de integração entre frontend e backend

## Resultado

| Problema | Causa | Correção | Teste | Status |
|---|---|---|---|---|
| Plano perdido após login/cadastro | `destinoAposAutenticacao` ignorava `plano` e os dois botões pagos da Landing Page apontavam para `/cadastro` sem o código | Os botões passam `intermediario` ou `avancado`; o login aceita apenas esses códigos e leva usuários comuns a `/finalizar-pagamento?plano=<codigo>`. O cadastro mantém a mesma URL ao voltar para o formulário de login. Destinos externos são ignorados; admin continua em `/admin/inicio`. | Contrato de login sem plano, com os dois planos, com parâmetro malicioso e com admin; suíte integrada de autenticação | Corrigido |
| `/confirmar-email` sem HTML | A rota existente apontava para `frontend/usuario/Confirmar-email/index.html`, ausente no checkout | Criados HTML e JS nessa localização. O JS lê o token e escolhe `POST /api/usuarios/email/verificar` para verificação inicial ou `POST /api/usuarios/email/confirmar` quando `tipo=alteracao`. O token sai da URL antes da chamada. O endpoint GET de alteração continua redirecionando com status 303. | Contrato do JS, GET HTTP da página, integração PostgreSQL para verificação inicial, alteração persistida e tokens inválidos, expirados ou reutilizados | Corrigido |
| CSS da Landing Page ausente | O HTML usava `/assets/usuario/landing-page/landing.css`, mas o arquivo real estava em `frontend/landing-page/landing.css` | `href` alterado para `/assets/landing-page/landing.css`, que corresponde ao mapeamento `express.static(frontendRoot)` em `/assets` | GET `/`, GET do CSS e da imagem, verificação de todas as referências `/assets` dos HTMLs | Corrigido |

## Investigação e arquivos

- `frontend/usuario/Confirmar-email/index.html` não existia, não estava ignorado pelo Git e não foi encontrado nas branches locais `main`, `origin/main` e `origin/dev-front`. Há um único worktree. O arquivo também não constava como removido no checkout. A rota já apontava para esse caminho, por isso a página foi criada ali. O build TypeScript não copia HTML: o Express lê os arquivos de `frontend` diretamente em desenvolvimento e na versão compilada.
- Os códigos `intermediario` e `avancado` são os usados pela API de planos; o parâmetro `plano` do checkout é um código, não um UUID. O checkout continua obtendo nome, preço e limites da API.
- A troca de e-mail mantém o link `GET /api/usuarios/email/confirmar?token=...`, que redireciona para `/confirmar-email?tipo=alteracao&token=...`. A página executa o POST correspondente. A verificação inicial executa `POST /api/usuarios/email/verificar`. A lógica de hash, prazo, consumo único e transação no backend não foi alterada; tokens não são registrados em logs pela página.
- Arquivos alterados: `frontend/usuario/Login/api.js`, `frontend/landing-page/index.html`, `backend/package.json`, `backend/src/tests/contracts.test.ts`, `backend/src/tests/integration/api.test.ts` e `backend/src/tests/integration/emailOutbox.test.ts`. Arquivos criados: `frontend/usuario/Confirmar-email/index.html`, `frontend/usuario/Confirmar-email/confirmar-email.js` e `backend/src/tests/integration/webRoutes.integration.test.ts`.

## Validação

- `npm run typecheck -w backend`: aprovado.
- `npm run build -w backend`: aprovado; gera Prisma Client e compila TypeScript.
- `npm test -w backend`: 62 testes aprovados, nenhuma falha. A falha anterior do redirecionamento desapareceu sem remover o teste.
- `npm run test:web -w backend`: aprovado para o código fonte e também com `WEB_TEST_BUILD=true` para `dist/app.js`. Cobriu Landing Page, CSS, imagem, JS de confirmação, HTML de confirmação, saúde da API e redirect do link de alteração.
- Verificação das referências locais `/assets` em todos os HTMLs: 453 referências, nenhuma ausente. A Landing Page usa ícones Bootstrap por CDN e não possui JavaScript próprio.
- `npm run test:integration -w backend` com `TEST_DATABASE_URL` apontando para banco temporário `vizin_contract_test_*`: aprovado após aplicar migrations somente nesse banco. Incluiu testes de autenticação, confirmação inicial e troca de e-mail, assinaturas, contratos frontend/backend, administração e Socket.IO. O banco temporário foi removido ao final.
- `api.test.ts` foi repetido após o teste adicional da raiz para usuário autenticado; passou em outro banco temporário, também removido.

## Limites do ambiente e deploy

- No sandbox padrão, `listen 127.0.0.1` retorna `EPERM`. Os testes HTTP passaram com a permissão de rede local apropriada; portanto, há validação HTTP real tanto do código fonte quanto do compilado.
- O `TEST_DATABASE_URL` atual em `backend/.env` está malformado e aponta para o banco principal. Os comandos de integração executados diretamente com esse valor falham antes dos testes. Para validar, foi fornecida uma URL de banco temporário isolado apenas aos processos de teste. O arquivo `.env` e o banco principal não foram alterados.
- `test:email-outbox` isolado exige `MAILPIT_BIN`, ausente neste ambiente; o fluxo de e-mail foi validado via outbox persistida e endpoints HTTP na suíte `api.test.ts`. O envio SMTP real depende de Mailpit/SMTP configurado.
- O backend inicia com `npm run dev` (código fonte) ou `npm run build` seguido de `npm start` (versão compilada), na porta `PORT=8080` deste ambiente. Em ambos os modos, `/assets` lê a pasta `frontend` irmã de `backend`. Não há etapa de cópia dos arquivos estáticos no build.
- `APP_URL` e `FRONTEND_ORIGINS` incluem um endereço `trycloudflare.com`; não foi encontrada configuração versionada do processo `cloudflared`. Não havia servidor em execução na inspeção inicial. Não foram alteradas configurações de produção nem verificado o endereço público externo.
- Para publicar, inclua os novos arquivos de `frontend/usuario/Confirmar-email` e a pasta existente `frontend/landing-page` no artefato de deploy. Como as correções de produção estão em arquivos estáticos e as rotas do backend já existiam, **recompilar o backend não é estritamente necessário se o processo atual já executa estas rotas e lê essa mesma pasta `frontend`**. Faça o deploy dos arquivos e reinicie o serviço se o processo público usa um checkout/artefato separado ou uma versão antiga; no fluxo usual de deploy, execute `npm run build` e reinicie `npm start` para garantir que a versão servida seja a atual. O Tunnel deve encaminhar para a porta configurada.
