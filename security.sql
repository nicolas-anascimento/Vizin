-- =============================================
-- VIZIN PC - Segurança, Roles e RLS
-- Versão corrigida
-- =============================================

-- =============================================
-- 1. CRIAÇÃO DE CARGOS (ROLES)
-- =============================================

-- Revogar tudo do público para segurança máxima inicial
REVOKE ALL ON ALL TABLES IN SCHEMA public FROM PUBLIC;

-- Administrador com poder total + bypass de RLS
-- [CORRIGIDO] BYPASSRLS elimina a necessidade de criar policies admin em cada tabela
CREATE ROLE vizin_admin NOLOGIN BYPASSRLS;
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO vizin_admin;
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO vizin_admin;

-- Usuário comum do aplicativo
CREATE ROLE vizin_user NOLOGIN;

-- =============================================
-- 2. PERMISSÕES DE TABELA (GRANTS)
-- =============================================

-- [NOVO] Sequences — sem isso INSERT falha com gen_random_uuid()
GRANT USAGE ON ALL SEQUENCES IN SCHEMA public TO vizin_user;

-- Leitura em tabelas públicas / catálogo
GRANT SELECT ON categorias, planos, view_itens_home TO vizin_user;

-- Usuarios
GRANT SELECT ON usuarios TO vizin_user;
GRANT INSERT ON usuarios TO vizin_user;
-- ATENÇÃO: saldo_carteira e verificado são atualizados apenas pelo backend/admin
GRANT UPDATE (nome, email, telefone, foto_url, bio) ON usuarios TO vizin_user;

-- Endereços, itens e fotos
GRANT SELECT, INSERT, UPDATE, DELETE ON enderecos TO vizin_user;
GRANT SELECT, INSERT, UPDATE ON itens TO vizin_user;
GRANT SELECT, INSERT, UPDATE, DELETE ON fotos_item TO vizin_user;

-- Aluguéis e pagamentos
GRANT SELECT, INSERT, UPDATE (status) ON alugueis TO vizin_user;
GRANT SELECT, INSERT ON pagamentos TO vizin_user;

-- Avaliações
GRANT SELECT, INSERT ON avaliacoes TO vizin_user;

-- Mensagens e notificações
GRANT SELECT, INSERT ON mensagens TO vizin_user;
GRANT UPDATE (lida) ON mensagens TO vizin_user;
GRANT SELECT ON notificacoes TO vizin_user;
GRANT UPDATE (lida) ON notificacoes TO vizin_user;

-- Carteira e sinistros (somente leitura + abertura para usuários)
GRANT SELECT ON extrato_carteira TO vizin_user;
GRANT SELECT, INSERT ON sinistros TO vizin_user;
-- fundo_reserva é invisível para usuários comuns (propositadamente sem GRANT)

-- [NOVO] Garante que novas tabelas criadas no futuro também recebam permissões
ALTER DEFAULT PRIVILEGES IN SCHEMA public
    GRANT SELECT, INSERT, UPDATE ON TABLES TO vizin_user;

ALTER DEFAULT PRIVILEGES IN SCHEMA public
    GRANT USAGE ON SEQUENCES TO vizin_user;

-- =============================================
-- 3. ROW LEVEL SECURITY (RLS)
-- =============================================

-- Habilitar RLS nas tabelas principais
ALTER TABLE usuarios         ENABLE ROW LEVEL SECURITY;
ALTER TABLE enderecos        ENABLE ROW LEVEL SECURITY;
ALTER TABLE itens            ENABLE ROW LEVEL SECURITY;
ALTER TABLE fotos_item       ENABLE ROW LEVEL SECURITY;  -- [NOVO]
ALTER TABLE alugueis         ENABLE ROW LEVEL SECURITY;
ALTER TABLE avaliacoes       ENABLE ROW LEVEL SECURITY;  -- [NOVO]
ALTER TABLE sinistros        ENABLE ROW LEVEL SECURITY;  -- [NOVO]
ALTER TABLE extrato_carteira ENABLE ROW LEVEL SECURITY;
ALTER TABLE mensagens        ENABLE ROW LEVEL SECURITY;
ALTER TABLE notificacoes     ENABLE ROW LEVEL SECURITY;

-- =============================================
-- POLÍTICAS: USUARIOS
-- =============================================

-- Qualquer usuário pode ver o perfil de outros (necessário para ver dono do item)
CREATE POLICY user_select_usuarios ON usuarios
    FOR SELECT TO vizin_user
    USING (true);

-- Só pode atualizar o próprio perfil
CREATE POLICY user_update_usuarios ON usuarios
    FOR UPDATE TO vizin_user
    USING (id = current_setting('request.jwt.claim.sub', true)::uuid);

-- =============================================
-- POLÍTICAS: ENDERECOS
-- =============================================

-- Só vê e manipula os próprios endereços
CREATE POLICY user_all_enderecos ON enderecos
    TO vizin_user
    USING (usuario_id = current_setting('request.jwt.claim.sub', true)::uuid);

-- =============================================
-- POLÍTICAS: ITENS
-- =============================================

-- Qualquer um pode ver itens disponíveis
CREATE POLICY user_select_itens ON itens
    FOR SELECT TO vizin_user
    USING (true);

-- Só pode inserir itens vinculados a si mesmo
CREATE POLICY user_insert_itens ON itens
    FOR INSERT TO vizin_user
    WITH CHECK (usuario_id = current_setting('request.jwt.claim.sub', true)::uuid);

-- Só pode editar os próprios itens
CREATE POLICY user_update_itens ON itens
    FOR UPDATE TO vizin_user
    USING (usuario_id = current_setting('request.jwt.claim.sub', true)::uuid);

-- =============================================
-- POLÍTICAS: FOTOS_ITEM [NOVO]
-- =============================================

-- Qualquer um pode ver fotos (necessário para a listagem de itens)
CREATE POLICY user_select_fotos ON fotos_item
    FOR SELECT TO vizin_user
    USING (true);

-- Só pode inserir/deletar fotos dos próprios itens
CREATE POLICY user_insert_fotos ON fotos_item
    FOR INSERT TO vizin_user
    WITH CHECK (
        item_id IN (
            SELECT id FROM itens
            WHERE usuario_id = current_setting('request.jwt.claim.sub', true)::uuid
        )
    );

CREATE POLICY user_delete_fotos ON fotos_item
    FOR DELETE TO vizin_user
    USING (
        item_id IN (
            SELECT id FROM itens
            WHERE usuario_id = current_setting('request.jwt.claim.sub', true)::uuid
        )
    );

-- =============================================
-- POLÍTICAS: ALUGUEIS
-- =============================================

-- [CORRIGIDO] Usa locador_id direto em vez de subquery em itens
CREATE POLICY user_select_alugueis ON alugueis
    FOR SELECT TO vizin_user
    USING (
        locatario_id = current_setting('request.jwt.claim.sub', true)::uuid
        OR
        locador_id   = current_setting('request.jwt.claim.sub', true)::uuid
    );

-- Só pode criar aluguel como locatário
CREATE POLICY user_insert_alugueis ON alugueis
    FOR INSERT TO vizin_user
    WITH CHECK (locatario_id = current_setting('request.jwt.claim.sub', true)::uuid);

-- Só pode atualizar status de aluguéis onde é parte
CREATE POLICY user_update_alugueis ON alugueis
    FOR UPDATE TO vizin_user
    USING (
        locatario_id = current_setting('request.jwt.claim.sub', true)::uuid
        OR
        locador_id   = current_setting('request.jwt.claim.sub', true)::uuid
    );

-- =============================================
-- POLÍTICAS: AVALIACOES [NOVO]
-- =============================================

-- Pode ver avaliações onde é avaliador ou avaliado
CREATE POLICY user_select_avaliacoes ON avaliacoes
    FOR SELECT TO vizin_user
    USING (
        avaliador_id = current_setting('request.jwt.claim.sub', true)::uuid
        OR
        avaliado_id  = current_setting('request.jwt.claim.sub', true)::uuid
    );

-- Só pode criar avaliação como avaliador
CREATE POLICY user_insert_avaliacoes ON avaliacoes
    FOR INSERT TO vizin_user
    WITH CHECK (avaliador_id = current_setting('request.jwt.claim.sub', true)::uuid);

-- =============================================
-- POLÍTICAS: SINISTROS [NOVO]
-- =============================================

-- Só vê sinistros que reportou
CREATE POLICY user_select_sinistros ON sinistros
    FOR SELECT TO vizin_user
    USING (reportador_id = current_setting('request.jwt.claim.sub', true)::uuid);

-- Só pode abrir sinistro como reportador
CREATE POLICY user_insert_sinistros ON sinistros
    FOR INSERT TO vizin_user
    WITH CHECK (reportador_id = current_setting('request.jwt.claim.sub', true)::uuid);

-- =============================================
-- POLÍTICAS: EXTRATO DA CARTEIRA
-- =============================================

-- Só vê o próprio extrato
CREATE POLICY user_select_extrato ON extrato_carteira
    FOR SELECT TO vizin_user
    USING (usuario_id = current_setting('request.jwt.claim.sub', true)::uuid);

-- =============================================
-- POLÍTICAS: MENSAGENS
-- =============================================

-- Só vê mensagens onde é remetente ou destinatário
CREATE POLICY user_select_mensagens ON mensagens
    FOR SELECT TO vizin_user
    USING (
        remetente_id    = current_setting('request.jwt.claim.sub', true)::uuid
        OR
        destinatario_id = current_setting('request.jwt.claim.sub', true)::uuid
    );

-- Só pode enviar mensagens como remetente
CREATE POLICY user_insert_mensagens ON mensagens
    FOR INSERT TO vizin_user
    WITH CHECK (remetente_id = current_setting('request.jwt.claim.sub', true)::uuid);

-- Só pode marcar como lida se for o destinatário
CREATE POLICY user_update_mensagens ON mensagens
    FOR UPDATE TO vizin_user
    USING (destinatario_id = current_setting('request.jwt.claim.sub', true)::uuid);

-- =============================================
-- POLÍTICAS: NOTIFICAÇÕES
-- =============================================

-- Só vê as próprias notificações
CREATE POLICY user_all_notificacoes ON notificacoes
    TO vizin_user
    USING (usuario_id = current_setting('request.jwt.claim.sub', true)::uuid);
