# Vizin Backend

API em Express, TypeScript, PostgreSQL/PostGIS e Prisma.

## Desenvolvimento

```bash
cp .env_example .env
docker compose up -d
npm install
npm run prisma:generate
npm run db:push
npm run seed
npm run dev
```

Servidor padrão: `http://localhost:8080`.

## Scripts

- `npm run dev`: servidor com recarga;
- `npm run build`: gera Prisma Client e compila TypeScript;
- `npm start`: executa `dist/app.js`;
- `npm run typecheck`: valida TypeScript;
- `npm test`: testes unitários;
- `npm run db:push`: sincronização rápida para desenvolvimento;
- `npm run db:migrate`: cria migration em desenvolvimento;
- `npm run db:deploy`: aplica migrations versionadas;
- `npm run seed`: categorias e administrador.

## Rotas principais

### Sessão e usuários

- `POST /api/usuarios`
- `POST /api/login`
- `POST /api/login/logout`
- `GET /api/login/sessao`
- `POST /api/contas/recuperar-senha`
- `POST /api/contas/resetar-senha`
- `GET /api/usuarios/me`
- `GET|PUT|PATCH /api/usuarios/perfil`
- `POST /api/usuarios/avatar`
- `GET /api/usuarios/:id`

### Objetos

- `GET|POST /api/objetos`
- `GET /api/objetos/meus`
- `GET|PUT|PATCH|DELETE /api/objetos/:id`
- `GET /api/categorias`

### Aluguéis

- `GET|POST /api/solicitacoes`
- `GET /api/solicitacoes/:id/status`
- `PATCH /api/solicitacoes/:id/status`
- Alias equivalente em `/api/alugueis`.

Transições permitidas:

- `pendente → aprovado | recusado | cancelado`
- `aprovado → pago` pelo endpoint de pagamento ou `cancelado` pelo locatário
- `pago → retirado` pelo registro da retirada
- `retirado → devolvido`
- `devolvido → finalizado`

### Pagamentos e retirada

- `POST /api/pagamentos/pix/gerar`
- `POST /api/pagamentos/pix/confirmar`
- `POST /api/pagamentos/cartao`
- `GET /api/pedidos/:id`
- `POST /api/retiradas`

### Outras áreas

- `/api/notificacoes`
- `/api/avaliacoes`
- `/api/mensagens`
- `/api/admin/*`
- `GET /api/saude`

## Segurança

- JWT expira em 30 dias;
- senha redefinida invalida tokens anteriores;
- páginas privadas também são protegidas no servidor;
- uploads aceitam apenas JPG, PNG, WEBP e GIF, até 5 MB por arquivo;
- pagamentos simulados são bloqueados fora do ambiente de desenvolvimento;
- login, cadastro e recuperação de senha possuem rate limit.

## Produção

```bash
npm ci
npm run build
npm run db:deploy
npm start
```

O pagamento real precisa ser integrado antes do deploy. Configure SMTP, HTTPS, backup do banco, armazenamento externo de uploads e observabilidade para uma operação pública.
