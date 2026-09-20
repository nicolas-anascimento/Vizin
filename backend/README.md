# VIZIN Backend

Backend em TypeScript, Node.js, Express 5, Prisma 7.8 com adapter `pg`, PostgreSQL e PostGIS. Não usa MongoDB nem autenticação por e-mail. Login usa CPF validado e senha; e-mail é utilizado para recuperação e confirmação de alteração.

```bash
cp .env.example .env
# Ajuste DATABASE_URL e JWT_KEY antes de iniciar.
docker compose up -d
npm ci
npm run build
npm run db:deploy
npm run seed
npm run dev
```

`ADMIN_EMAIL`, `ADMIN_CPF` válido e `ADMIN_PASSWORD` configuram o administrador via seed. Não há credenciais administrativas fixas. Em produção use `NODE_ENV=production`, HTTPS, SMTP e `PAYMENT_MODE=gateway`.

O servidor disponibiliza a API em `/api`, os assets existentes em `/assets` e páginas em rotas como `/login`, `/home`, `/historico` e `/mensagens`. O diretório real do frontend é `../frontend-mocks`. **Essas telas ainda possuem fluxos simulados com localStorage e chamadas de API comentadas. O backend implementa os contratos descritos nelas, mas não transforma essas simulações em chamadas reais. Nenhum arquivo do frontend foi alterado.**

- [Contratos, rotas, regras e integração de gateway](docs/API.md)
- [Relatório da implementação e verificações](docs/IMPLEMENTACAO.md)

```bash
npm run typecheck
npm test
# Prepare um banco separado vizin_contract_test_* e aplique as migrations nele.
TEST_DATABASE_URL=postgresql://.../vizin_contract_test_exemplo npm run test:integration
```

Os testes de integração e financeiros exigem banco separado com PostGIS e recusam nomes fora do prefixo `vizin_contract_test_`. Sem `TEST_DATABASE_URL` ambos os comandos falham; nunca informam sucesso com zero testes. Não utilizam mocks de banco. `npm run build` gera o client Prisma e compila todo `src`, incluindo adapters legados e testes. Não há lint configurado.

Use `npm run db:deploy` para migrations versionadas; `db:push` é somente uma ferramenta de desenvolvimento e não substitui migrations. Nesta revisão, aplique migrations apenas num banco isolado de testes; a verificação do banco original é somente de leitura com `npx prisma migrate status`.
