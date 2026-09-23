# Auditoria frontend administrativo x backend

Inventário anterior às alterações desta tarefa, levantado em 2026-09-22 a partir de todos os arquivos HTML e JavaScript de `frontend/admin/**`, do cliente compartilhado `frontend/usuario/Login/api.js` carregado pelas páginas administrativas e de `backend/src/**`.

## O que o frontend administrativo pede

| Tela/componente | Método | Rota solicitada | Dados enviados | Dados efetivamente usados/esperados |
|---|---:|---|---|---|
| Sidebar/perfil | GET | `/api/login/sessao` | Bearer ou cookie | `id`, `nome`, `email`, `tipo`, `avatarUrl`, `verificado` |
| Sidebar/logout | POST | `/api/login/logout` | Bearer ou cookie | sucesso; `401` também encerra a sessão local |
| Sidebar/layout | GET | `/partials/admin-sidebar` | cookie/sessão da página | fragmento HTML |
| Usuários/lista | GET | `/api/admin/usuarios` | `page`, `limit`; busca e status eram aplicados no navegador após baixar todas as páginas | `{ dados, total, pagina, paginas }`; por linha: `id`, `nome`, `email`, `ativo`, `criado_em` |
| Usuários/detalhe | GET | `/api/admin/usuarios` (varredura paginada usada como contorno) | `page`, `limit=100` até achar o UUID | dados básicos do usuário; a tela possui seções de objetos, aluguéis e denúncias, mas recebia listas inexistentes e mostrava “dados não disponíveis” |
| Usuários/status | PATCH | `/api/admin/usuarios/:id/status` | `{ ativo: boolean }` | confirmação/sucesso |
| Usuários/exclusão | DELETE | `/api/admin/usuarios/:id` | sem payload | confirmação/sucesso |
| Editar usuário | — | — | — | página explicitamente informa que edição geral não é oferecida; nenhuma chamada HTTP |
| Objetos/lista | GET | `/api/admin/objetos` | `page`, `limit`, `busca`, `status=ativo|removido|arquivado` | `{ data, total }`; item, proprietário, categoria, preço, disponibilidade, estado e foto principal |
| Objetos/modal de detalhe | — | reutilizava a linha de `/api/admin/objetos` | — | descrição, localização, todas as fotos, proprietário, categoria, preço, disponibilidade e estado |
| Objetos/moderação | PATCH | `/api/admin/objetos/:id` | `{ status: ativo|removido|arquivado, motivo? }` | objeto atualizado |
| Objetos/exclusão | DELETE | `/api/admin/objetos/:id` | `{ motivo }` | a UI descrevia hard-delete e esperava oferta posterior de arquivamento |
| Pagamentos/lista | GET | `/api/admin/pagamentos` | `page`, `limit`, `busca`, `status` | `{ data, total }`; `id`, `usuario.nome`, `metodo`, `valor`, `criado_em`, `status` |
| Pagamentos/detalhe | GET | `/api/admin/pagamentos/:id` | UUID | campos da cobrança, `usuario.nome`, `produto.titulo`, `tipo` e possível `motivo_falha` |
| Pagamentos/indicadores | GET | `/api/admin/pagamentos/estatisticas` | nenhum | `receita_total`, `receita_variacao_percentual`, `pagamentos_pendentes`, `transacoes_falhadas`, `receita_mensal[]`, `metodos[]` |

Não há, no frontend administrativo atual, consumidores de dashboard geral, aluguéis/solicitações, verificações de identidade, suporte, denúncias, sinistros, avaliações, categorias, conciliações ou webhooks.

## O que o backend administrativo já oferece

Todas as rotas abaixo já estavam sob `router.use(requireAdmin)` e `adminWriteLimit`.

| Método | Rota existente antes | Controller/service | DTO/contrato anterior |
|---:|---|---|---|
| GET | `/api/admin/metricas` | `adminController.metrics` | agregados de usuários, objetos, aluguéis, pagamentos, verificações e casos; período civil em `America/Sao_Paulo` |
| PATCH | `/api/admin/multas/:id` | `rentalReportsController.resolveFine` | decisão de multa |
| GET | `/api/admin/usuarios` | `adminController.listUsers` | `{ dados, total, pagina, paginas }`; campos seguros básicos, sem busca/status |
| PATCH | `/api/admin/usuarios/:id/cpf` | `adminController.correctUserCpf` | correção explícita de CPF, invalidação de sessão e auditoria |
| PATCH | `/api/admin/usuarios/:id/status` | `adminController.updateUserStatus` | `{ ativo }`; checa obrigações, trava registro, invalida sessão e audita |
| DELETE | `/api/admin/usuarios/:id` | `adminController.deleteUser` → `accountRemoval.removeAccount` | anonimização/arquivamento seguro, obrigações e auditoria transacional |
| GET | `/api/admin/objetos` | `adminController.listAdminItems` | paginação e `status=ativo|arquivado`; DTO resumido, sem busca, descrição/localização e indicadores de locação |
| PATCH | `/api/admin/objetos/:id` | `adminItemsController.updateAdminItem` | somente `{ disponivel, motivo? }`; bloqueios e auditoria transacional |
| DELETE | `/api/admin/objetos/:id` | `adminItemsController.archiveAdminItem` | arquivamento, não hard-delete; motivo, bloqueios e auditoria transacional |
| GET | `/api/admin/alugueis` | `adminController.listAdminRentals` | listagem paginada e filtro de status |
| PATCH | `/api/admin/alugueis/:id` | `rentalsController.updateRentalStatus` | transição administrativa |
| GET | `/api/admin/conciliacoes` | `adminResourcesController.adminReconciliations` | listagem financeira segura |
| GET | `/api/admin/conciliacoes/:id` | `adminResourcesController.adminReconciliation` | detalhe seguro, sem payload secreto |
| POST | `/api/admin/conciliacoes/:id/ignorar` | `adminResourcesController.ignoreReconciliation` | decisão idempotente e auditada |
| GET | `/api/admin/webhooks-pendentes` | `adminResourcesController.adminPendingWebhooks` | eventos pendentes paginados |
| GET | `/api/admin/pagamentos` | `adminResourcesController.adminPayments` | cobrança paginada segura, sem busca nem relações de usuário/produto |
| GET | `/api/admin/pagamentos/:id` | `adminResourcesController.adminPayment` | cobrança segura, sem relações de usuário/produto |
| POST | `/api/admin/pagamentos/:id/estornar` | `paymentsController.adminRefundPayment` | solicitação ao provedor; não força pagamento; idempotência e auditoria |
| GET | `/api/admin/verificacoes` | `identityController.listIdentities` | fila paginada sem caminhos privados |
| PATCH | `/api/admin/verificacoes/:id` | `identityController.reviewIdentity` | aprovação/reprovação condicional, notificação e auditoria |
| GET | `/api/admin/verificacoes/:id/documentos/:tipo` | `identityController.identityDocument` | arquivo privado autorizado, `no-store` |
| GET/PATCH | `/api/admin/suporte[/:id]` | `adminResourcesController.listCases/reviewCase` | lista/decisão com concorrência, resposta pública e auditoria |
| GET/PATCH | `/api/admin/denuncias[/:id]` | `adminResourcesController.listCases/reviewCase` | lista/decisão; nota interna separada da resposta pública |
| GET/PATCH | `/api/admin/sinistros[/:id]` | `adminResourcesController.listCases/reviewCase` | lista/decisão; nota interna separada da resposta pública |
| GET/DELETE | `/api/admin/avaliacoes[/:id]` | `adminResourcesController.adminReviews/removeReview` | lista/moderação auditada |
| GET/POST/PATCH/DELETE | `/api/admin/categorias[/:id]` | `itemsController.listCategories` e `adminResourcesController` | CRUD com slug único, bloqueio por uso e auditoria |

## Lacunas reais antes da implementação

| Tela | Necessidade | Situação anterior | Solução definida pela auditoria |
|---|---|---|---|
| Usuários/lista | busca e filtro de status paginados | ⚠️ backend atendia parcialmente; frontend baixava toda a base | ampliar a rota existente com `busca` e `status=ativo|inativo`; manter envelope legado |
| Usuários/detalhe | abrir um UUID sem varrer todas as páginas e mostrar resumo limitado | ❌ rota ausente | criar `GET /api/admin/usuarios/:id` com dados básicos usados e contagens agregadas; não retornar CPF/telefone, listas ilimitadas ou segredos |
| Usuários/edição | edição geral | não solicitada pela tela ativa | não criar `PUT/PATCH` genérico; preservar ações específicas já existentes |
| Objetos/lista | busca, disponibilidade real e detalhe visual | ⚠️ filtros/DTO insuficientes | adicionar busca e indicadores resumidos à listagem; buscar os dados visuais completos pela rota canônica já existente `GET /api/objetos/:id` |
| Objetos/moderação | ocultar/exibir/arquivar | ❌ payload e enum do frontend incompatíveis com o domínio booleano | adaptar frontend para `{ disponivel, motivo }`; usar DELETE como arquivamento explícito e remover estados fictícios `removido` |
| Objetos/exclusão | UI dizia hard-delete | ❌ semântica incompatível e perigosa | adaptar texto/ação para “arquivar”; não criar hard-delete administrativo |
| Pagamentos/lista | buscar e identificar pagador/produto | ⚠️ backend atendia parcialmente | ampliar a rota existente com busca e DTO relacionado seguro |
| Pagamentos/detalhe | pagador e objeto relacionado | ❌ DTO insuficiente | ampliar o DTO existente; não expor `dados`, cartão, token ou payload do gateway |
| Pagamentos/indicadores | agregados da tela | ❌ rota ausente | criar agregador único `GET /api/admin/pagamentos/estatisticas`, com receita baseada em `pago_em` e meses civis de São Paulo |

## Classificação anterior das operações ativas

| Operação | Classificação |
|---|---|
| sessão, logout e fragmento da sidebar | ✅ atendida |
| listar usuários | ⚠️ atendida parcialmente |
| detalhar usuário | ❌ rota ausente |
| alterar status/excluir usuário | ✅ atendida |
| listar objetos | ⚠️ atendida parcialmente |
| moderar objeto | ❌ método existente, payload incompatível |
| “excluir” objeto | ❌ semântica do frontend incompatível; backend arquiva corretamente |
| listar pagamentos | ⚠️ atendida parcialmente |
| detalhar pagamento | ❌ DTO insuficiente |
| estatísticas de pagamentos | ❌ rota ausente |

## Resultado implementado

### Rotas adicionadas

| Método | Rota | Contrato |
|---:|---|---|
| GET | `/api/admin/usuarios/:id` | `id`, `nome`, `email`, `tipo`, `ativo`, `verificado`, `foto_url`, `criado_em` e `estatisticas` com contagens de objetos, aluguéis por papel e denúncias recebidas |
| GET | `/api/admin/pagamentos/estatisticas` | receita paga total, variação mensal, pendentes, falhas, seis meses de receita por `pago_em`, totais pagos por método e semântica/fuso declarados |

### Rotas modificadas

| Método | Rota | Alteração compatível |
|---:|---|---|
| GET | `/api/admin/usuarios` | adicionados `busca` e `status=ativo|inativo`, preservando `{ dados, total, pagina, paginas }` e o DTO anterior |
| GET | `/api/admin/objetos` | adicionados busca por título/proprietário/categoria, `status` derivado apenas de `arquivado` e indicadores booleanos `emLocacao`/`solicitacaoPendente` |
| GET | `/api/admin/pagamentos` | adicionados busca e relações seguras `usuario { id, nome }` e `produto { id, titulo }` |
| GET | `/api/admin/pagamentos/:id` | adicionadas as mesmas relações seguras; `dados`, cartão e payload do provedor continuam ausentes |

### Chamadas corrigidas no frontend

- Detalhe de usuário usa diretamente `GET /api/admin/usuarios/:id`, sem varrer a coleção.
- Busca, filtro e paginação de usuários são executados pelo backend.
- O modal de objeto reutiliza `GET /api/objetos/:id`; não foi criada uma rota administrativa duplicada.
- Moderação de objeto envia `{ disponivel, motivo? }`, conforme o domínio existente.
- `DELETE /api/admin/objetos/:id` é apresentado como arquivamento; não existe promessa de hard-delete.
- O método financeiro canônico exibido é `pix` ou `cartao`; não foram inventadas modalidades de crédito/débito.

### Operações não criadas

| Operação imaginada pelo frontend anterior | Decisão |
|---|---|
| `PUT/PATCH /api/admin/usuarios/:id` genérico | não criado: a tela de edição está desativada e as ações legítimas já são específicas |
| `GET /api/admin/objetos/:id` | não criado: `GET /api/objetos/:id` já entrega o detalhe visual e autoriza admin para itens arquivados |
| enum de objeto `removido` | não criado: o schema possui apenas `disponivel` e `arquivado` |
| hard-delete administrativo de objeto | não criado: a rota DELETE existente arquiva com bloqueios e auditoria |
| “marcar pagamento como pago” | não criado: confirmação permanece responsabilidade do provedor/webhook |

### Compatibilidade após a implementação

Considerando as 14 operações HTTP ativas (sessão, logout, fragmento de sidebar e 11 operações de dados/ações nas três telas):

- Compatíveis: 14
- Parciais: 0
- Incompatíveis: 0
- Rotas inexistentes: 0

