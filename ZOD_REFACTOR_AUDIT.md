# VIZIN — auditoria e refatoração de validação com Zod

Data: 12/11/2026. Escopo: backend TypeScript/Express. O frontend, o schema Prisma, as migrations e as regras de negócio não foram reescritos nesta refatoração. Este documento descreve a migração efetivamente concluída, inclusive as lacunas.

## A. Diagnóstico anterior e inventário

Não havia dependência direta de Zod. Entradas HTTP eram conferidas em controllers, services e helpers com `typeof`, `String(...)`, `Number(...)`, regex, `req.params.id` e verificações de presença. Os mesmos padrões apareciam em cadastro/login, perfil, objetos, locações, administração e chat. Os helpers de texto, CPF, email, senha, UUID, booleano, paginação e data eram repetidos ou chamados em vários controllers sem um contrato de entrada tipado. Parte dessas verificações estava misturada com autorização, cota, persistência e regras financeiras; essas regras foram preservadas.

Inventário por AST dos registros explícitos `get/post/put/patch/delete` (um router montado em duas URLs conta uma vez; `router.use` genérico não entra na contagem):

| Arquivo de rotas | Registros | Com middleware `validate` |
|---|---:|---:|
| `accounts.ts` | 3 | 1 |
| `admin.ts` | 61 | 37 |
| `api.ts` | 21 | 12 |
| `cards.ts` | 4 | 3 |
| `conversations.ts` | 8 | 7 |
| `items.ts` | 10 | 7 |
| `login.ts` | 3 | 1 |
| `messages.ts` | 2 | 2 |
| `notifications.ts` | 6 | 2 |
| `rentals.ts` | 23 | 15 |
| `reviews.ts` | 1 | 1 |
| `subscriptions.ts` | 7 | 4 |
| `users.ts` | 35 | 17 |
| `withdrawals.ts` | 4 | 4 |
| **Routers de API** | **188** | **113** |
| `web.ts` (HTML) | 16 | 0 |
| `app.ts` (dois webhooks e upload privado) | 3 | 0 |

**Total analisado: 207 registros HTTP explícitos, dos quais 191 de API e 16 páginas HTML.** **Total com middleware Zod: 113 registros de API.** Alguns dos 78 registros de API restantes não recebem entrada, respondem 410 ou usam Zod diretamente dentro do handler/helper; essa distinção evita inflar a cobertura. O webhook de assinatura, por exemplo, usa Zod **depois** da autenticação HMAC e da leitura do corpo bruto. O POST multipart de objetos usa `itemDataSchema` no controller após o Multer.

Foram consolidadas **8 famílias de validações duplicadas** em schemas/helpers compartilhados: CPF, email, senha, texto, UUID, booleano, paginação e data. Este número conta famílias com mais de um uso, não ocorrências de `if` removidas. Na inspeção inicial havia aproximadamente 434 verificações manuais candidatas; esse número era exploratório e não deve ser interpretado como 434 substituições.

## B. Arquitetura implementada

- Zod **4.6.7** em `backend/package.json` e `package-lock.json`. Uso de `z.guid()` para aceitar o formato de UUID legado, `z.strictObject` nas entradas financeiras/sensíveis, `z.object` com passthrough onde há aliases/compatibilidade, `z.input`/`z.output`/`z.infer` e `safeParse`/`safeParseAsync`.
- Schemas em `backend/src/app/schemas/`, separados por domínio. O middleware `backend/src/app/middlewares/validate.ts` aceita `{body,params,query}`, chama `safeParseAsync` e guarda o resultado em `req.validated`. O corpo validado é atribuído a `req.body` para impedir uso acidental do corpo cru. `req.query` permanece intacto, pois Express 5 não garante atribuição a essa propriedade. `validatedPart` fornece a saída tipada do schema ao controller. Não foi introduzido bundler nem Zod no navegador.
- Erros estruturais respondem 422 com `success:false`, `codigo:"dados_invalidos"`, `message`/`mensagem` e `erros` por campo. O valor recebido não é incluído na mensagem. `InputValidationError` é tratado antes do `HttpError` geral. Erros de autorização/negócio, como `nao_autenticado`, `nao_pertence`, `limite_anuncios_atingido`, `idempotencia_conflitante`, `rota_financeira_descontinuada` e `arquivo_muito_grande`, permanecem nos respectivos mecanismos.
- `environmentSchema` valida porta numérica, URLs, banco PostgreSQL, segredo JWT, origens, SMTP e Mercado Pago sem imprimir segredos. A string `SMTP_SECURE="false"` vira `false`. Credenciais SMTP e MP continuam opcionais em ambientes que não as usam; produção exige URL HTTPS, segredo JWT e configuração de gateway quando ativa.

Schemas criados: `common.ts`, `query.schema.ts`, `auth.schema.ts`, `users.schema.ts`, `addresses.schema.ts`, `objects.schema.ts`, `rentals.schema.ts`, `subscriptions.schema.ts`, `conversations.schema.ts`, `messages.schema.ts`, `notifications.schema.ts`, `admin.schema.ts`, `cards.schema.ts`, `reviews.schema.ts`, `support.schema.ts` e `uploads.schema.ts`.

## C. Módulos migrados

| Módulo | Endpoints analisados | Schemas criados | Validações substituídas | Testes |
|---|---|---|---|---|
| Autenticação, usuários, email e endereços | Cadastro, login, recuperação, troca/verificação de email, senha, perfil, privacidade, preferências e endereço | `auth`, `users`, `addresses`, `common` | Payloads de cadastro/login/perfil, CPF, email, senha, tokens, IDs e patch de preferências; endereço com validação estrutural | Unitários, API/PostgreSQL e email por HTTP |
| Anúncios e locações | Criação/consulta/edição, filtros, datas, estado, avaliação e retirada/devolução | `objects`, `rentals`, `reviews`, `query`, `uploads` | Criação multipart, filtros numéricos, IDs, datas, estado e avaliação; parte da edição ainda manual | API, contratos frontend, vídeos |
| Assinaturas e cartão | Planos, assinatura, consulta, cancelamento, cartão tokenizado e webhook | `subscriptions`, `cards` | Plano, método, idempotência, cartão e estrutura do webhook | Financeiros/PostgreSQL |
| Chat, mensagens, notificações e suporte | Conversas, mensagens, eventos Socket.IO, notificações, ajuda, denúncia e sinistro | `conversations`, `messages`, `notifications`, `support`, `uploads` | IDs, corpo das mensagens, eventos de entrada, campos estruturais de suporte e metadados de upload | API, Socket.IO, upload privado |
| Administração | Usuários, objetos, categorias, ocorrências, moderação, verificações, comunicados e notificações | `admin`, `common`, `query` | IDs e ações sensíveis; filtros de listagem permanecem parcialmente manuais | Integração administrativa |
| Ambiente e utilitários | Inicialização e helpers usados em diversos endpoints | `environmentSchema`, `common`, `query` | Conversão de flags/números, URLs, paginação e datas | Unitários, typecheck, build |

O total de **113 registros de API com middleware Zod** é a métrica conservadora de endpoints migrados de forma centralizada. Rotas com Zod apenas em helpers/controllers não são somadas a esse total. Assim, a migração **não** atende ainda ao critério de todos os endpoints centralizados.

## D. Compatibilidade e diferenças

- URLs e métodos HTTP não foram alterados por esta refatoração. O frontend permanece em JavaScript puro e recebe `message` e `mensagem`; erros estruturais novos incluem `erros` e código `dados_invalidos`.
- Algumas entradas malformadas antes convertidas por `String(...)`/`Number(...)` ou ignoradas agora recebem 422, sobretudo tipos errados em endereços/suporte, IDs inválidos, datas/filtros, campos inesperados em pagamento/cartão e valor de mercado explícito inválido. Strings de booleano são interpretadas apenas conforme o contrato (`true`/`false`); números ambíguos deixam de ser aceitos. Isso é mudança intencional de entrada inválida, mas clientes legados não cobertos pelos testes podem exigir adaptação.
- Erros de negócio mantêm seus códigos e status. Cadastro/login, checkout de assinatura, emails, cotas, estados de locação, autorização, chat, upload e administração passaram na suíte de integração. Os testes não provam equivalência de todos os textos de erro para todos os payloads possíveis.
- `TEST_DATABASE_URL` local foi encontrado com prefixo `DATABASE_URL=` e apontando para o banco principal; os testes foram executados com **sobrescrita em processo** para banco temporário. A refatoração não alterou esse arquivo nem rodou testes destrutivos em `vizin`.

## E. Segurança

Zod rejeita estrutura, tipos, limites e IDs antes de boa parte dos handlers. Continua sendo responsabilidade dos middlewares e serviços validar sessão/Bearer, autorização do participante e do administrador, rate limit, hash/expiração/uso único dos tokens, cota transacional no PostgreSQL e estado de locação. O webhook preserva corpo bruto, HMAC, consulta confiável ao Mercado Pago, valores do servidor e idempotência; não usa o status enviado pelo cliente como fonte de verdade. Multer, armazenamento privado, verificação real do contêiner, `ffprobe`, autenticação e Range de vídeo foram mantidos. Eventos de presença continuam emitidos pelo servidor.

## F. Testes e execução

| Verificação | Resultado |
|---|---|
| Typecheck e build TypeScript/Prisma | Aprovados |
| `prisma validate` | Aprovado |
| Unitários (`npm test`) | 69 aprovados, 0 falhas |
| Integração em PostgreSQL/PostGIS temporário (`npm run test:integration`) | 79 aprovados, 0 falhas, 4 ignorados por rotas financeiras de aluguel descontinuadas |
| Contratos frontend, autenticação, email, financeiro, chat/Socket.IO, upload e administração | Incluídos nos 79 testes de integração aprovados |
| Rotas HTML e assets por HTTP (`npm run test:web`) | 1 aprovado |
| Email outbox com Mailpit (`npm run test:email-outbox`) | Bloqueado: `MAILPIT_BIN` não configurado/binário não encontrado |
| Playwright | Bloqueado: `playwright.config.ts` existe, mas não há testes em `tests/e2e` no checkout |

O runner abriu porta HTTP local nos testes de integração e no `test:web` sob execução autorizada. Os bancos temporários foram criados, migrados e removidos após cada rodada. O teste de email via HTTP cobriu token único, expiração, reutilização, redirecionamento HTML e persistência da troca; o teste Mailpit de entrega SMTP real continua pendente. Não houve falhas finais. Durante a migração, falhas de tipagem em `exactOptionalPropertyTypes` e uma exceção de URL no schema de ambiente foram corrigidas antes da execução final.

## G. Arquivos alterados nesta refatoração

Criados: `backend/src/app/schemas/{common,query.schema,auth.schema,users.schema,addresses.schema,objects.schema,rentals.schema,subscriptions.schema,conversations.schema,messages.schema,notifications.schema,admin.schema,cards.schema,reviews.schema,support.schema,uploads.schema}.ts`, `backend/src/app/middlewares/validate.ts`, `backend/src/tests/zodValidation.test.ts` e este relatório.

Modificados: `backend/package.json`, `package-lock.json`, `backend/src/app/config/env.ts`, `backend/src/app/middlewares/{errorHandler,privateUpload}.ts`, `backend/src/app/types/express.d.ts`, `backend/src/app/utils/{validation,strings,admin,dates}.ts`, `backend/src/app/services/notificationPreferences.ts`, `backend/src/app/controllers/{auth,accounts,accountSettings,users,items,rentals,handover,subscriptions,conversations,messages,notifications,cards,reviews,admin,adminResources,adminCampaigns}.ts` (somente os arquivos existentes pertinentes), `backend/src/app/routes/{accounts,admin,api,cards,conversations,items,login,messages,notifications,rentals,reviews,subscriptions,users,withdrawals}.ts`, `backend/src/realtime/{chatSocket,types}.ts` e `backend/src/tests/integration/api.test.ts`. O repositório já continha muitas outras alterações não relacionadas antes desta tarefa; esta lista descreve o trabalho de Zod, não todo o `git status`.

## H. Pendências

1. Migrar os filtros de consulta de listas administrativas (`adminController`, `adminResourcesController`, `adminNotificationsController`, `adminOccurrencesController`, `adminAuditController`) para schemas específicos por rota e consumir a saída tipada. Atualmente parte deles usa `pagination`/`text`/`uuid` com Zod, mas o encadeamento ainda está no controller.
2. Migrar toda a edição parcial de anúncios, as validações finais de endereço/sinistro e os formulários de identidade/avatar para DTOs Zod completos, respeitando a combinação com dados persistidos e os códigos de erro legados. A validação real de arquivo, as cotas e as transações devem permanecer onde estão.
3. Revisar cada rota sem `validate` que recebe query/body: confirmação de email e redefinição de senha usam Zod diretamente para preservar códigos legados; listagens e alguns formulários de usuário usam helpers Zod, mas não um middleware único. Rotas sem entrada e rotas 410 não precisam de schema artificial.
4. Configurar Mailpit isolado para executar `test:email-outbox`; adicionar testes Playwright reais se a validação visual for requisito de entrega. Não usar o banco principal.

## I. Veredito

**C — Migração parcial, com endpoints ainda utilizando validação manual significativa.** A infraestrutura Zod 4, 16 módulos de schema, 113 registros centralizados e os principais fluxos foram implementados e testados. Ainda não é correto declarar a refatoração completa de todos os endpoints. Para colocar as alterações compiladas em operação no endereço público, é necessário reconstruir e reiniciar o processo backend (`npm run build` e reinício do serviço); nenhuma configuração de produção foi modificada.
