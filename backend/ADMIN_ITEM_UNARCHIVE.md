# Desarquivamento administrativo de anúncios

## Auditoria inicial

O arquivamento administrativo existente é feito por `DELETE /api/admin/objetos/:id`. A operação valida UUID e motivo, bloqueia a linha de `itens` com `SELECT ... FOR UPDATE`, impede arquivamento com solicitação pendente ou locação ativa e grava objeto, auditoria e notificação na mesma transação.

No schema atual, o estado persistido de arquivamento é somente `itens.arquivado`. Não existem colunas `status` ou `arquivado_em`; `status` é derivado como `ativo` ou `arquivado` no serializer. Os campos independentes `disponivel`, `oculto_pelo_admin` e `motivo_ocultacao` controlam, respectivamente, a preferência do proprietário e a moderação. Por isso, nenhuma migration ou coluna redundante foi criada.

Antes desta alteração não havia operação administrativa interna para reverter `arquivado=true`. A rota de edição do proprietário rejeita anúncios arquivados com `409 objeto_arquivado`.

Registros legados arquivados pelo fluxo do proprietário podem ter `disponivel=false`. Como o banco não registra a disponibilidade anterior, o desarquivamento preserva esse valor em vez de tentar reconstruí-lo.

## Contrato para o frontend

```http
POST /api/admin/objetos/:id/desarquivar
Authorization: Bearer <token-admin>
Content-Type: application/json
```

```json
{
  "motivo": "Anúncio revisado e liberado pela administração."
}
```

Somente a chave `motivo` é aceita. Ela é obrigatória, deve ser string não vazia após `trim`, não pode conter os caracteres proibidos pela validação textual comum e tem limite de 1.000 caracteres.

### 200

A resposta é o mesmo DTO de cada entrada de `GET /api/admin/objetos`:

```json
{
  "id": "uuid",
  "usuario_id": "uuid",
  "titulo": "Furadeira",
  "preco_por_dia": 25,
  "disponivel": true,
  "arquivado": false,
  "oculto_pelo_admin": false,
  "motivo_ocultacao": null,
  "criado_em": "2026-10-20T12:00:00.000Z",
  "categorias": null,
  "usuarios": { "id": "uuid", "nome": "Proprietário" },
  "fotos_item": [],
  "status": "ativo",
  "emLocacao": false,
  "solicitacaoPendente": false,
  "em_locacao": false,
  "tem_solicitacao_pendente": false
}
```

`disponivel`, `oculto_pelo_admin` e `motivo_ocultacao` são preservados. A resposta pode, portanto, continuar indicando anúncio pausado ou ocultado mesmo com `status="ativo"`.

### Erros

- `401 nao_autenticado`: sessão ausente ou inválida.
- `403 admin_required`: usuário comum, administrador suspenso ou papel sem permissão.
- `404 nao_encontrada`: objeto inexistente.
- `409 nao_arquivado`: `{ "codigo": "nao_arquivado", "mensagem": "Este anúncio já está ativo e não precisa ser desarquivado." }`.
- `422 dados_invalidos`: UUID, motivo ou chaves do body inválidos. A validação atual usa HTTP 422, não 400.

Todos os erros seguem o envelope comum com `success=false`, `codigo`, `message` e `mensagem`.

## Auditoria, concorrência e notificação

A operação usa lock de linha PostgreSQL. Duas chamadas simultâneas produzem exatamente um `200` e um `409 nao_arquivado`. A alteração, a auditoria `anuncio_desarquivado` e a notificação persistida pertencem à mesma transação.

A notificação do proprietário usa exatamente:

- `tipo`: `anuncio_desarquivado_admin`
- `titulo`: `Anúncio desarquivado`
- `contexto`: `{ "objetoId": "<uuid-do-objeto>" }`

Depois do commit, a mesma notificação serializada é publicada no evento realtime `notification:new`. O tipo é uma notificação administrativa obrigatória e não foi associado a uma preferência opcional de marketing.

## Visibilidade

O desarquivamento apenas define `arquivado=false`. As rotas públicas continuam exigindo `disponivel=true`, `oculto_pelo_admin=false` e proprietário com conta ativa. O detalhe público conserva as mesmas regras; proprietário e administrador mantêm o acesso autorizado. `GET /api/objetos/meus` inclui o objeto do proprietário, e os filtros administrativos passam a incluí-lo em `status=ativo` e excluí-lo de `status=arquivado`.

## Implementação e testes

- Controller: `src/app/controllers/adminItemsController.ts`
- Rota: `src/app/routes/admin.ts`
- Serializer compartilhado: `src/app/utils/serializers.ts`
- Teste PostgreSQL/PostGIS: `src/tests/integration/admin.integration.test.ts`
- Prisma: sem alteração de schema ou migration para esta funcionalidade


