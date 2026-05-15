-- =============================================
-- VIZIN PC - Banco de Dados Unificado
-- Versão corrigida
-- =============================================

CREATE EXTENSION IF NOT EXISTS postgis;

-- =============================================
-- USUÁRIOS E CARTEIRA
-- =============================================
CREATE TABLE usuarios (
    id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    nome           VARCHAR(100) NOT NULL,
    email          VARCHAR(150) NOT NULL UNIQUE,
    senha_hash     TEXT NOT NULL,
    telefone       VARCHAR(20),
    foto_url       TEXT,
    bio            TEXT,
    cpf            VARCHAR(14) UNIQUE,
    verificado     BOOLEAN DEFAULT FALSE,
    saldo_carteira DECIMAL(10, 2) DEFAULT 0.00,
    criado_em      TIMESTAMP DEFAULT NOW(),
    atualizado_em  TIMESTAMP DEFAULT NOW()
);

-- =============================================
-- ENDEREÇOS DOS USUÁRIOS
-- =============================================
CREATE TABLE enderecos (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    usuario_id    UUID NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
    cep           VARCHAR(10) NOT NULL,
    numero        VARCHAR(10) NOT NULL,
    complemento   VARCHAR(100),
    rua           VARCHAR(200),
    bairro        VARCHAR(100),
    cidade        VARCHAR(100),
    estado        CHAR(2) CHECK (estado IN (
                    'AC','AL','AP','AM','BA','CE','DF','ES','GO','MA',
                    'MT','MS','MG','PA','PB','PR','PE','PI','RJ','RN',
                    'RS','RO','RR','SC','SP','SE','TO'
                  )),
    -- [CORRIGIDO] GEOMETRY → GEOGRAPHY para distâncias em metros
    localizacao   GEOGRAPHY(Point, 4326),
    principal     BOOLEAN DEFAULT FALSE  -- [NOVO] identifica o endereço padrão do usuário
);

-- Índice espacial para otimizar buscas por geolocalização
CREATE INDEX idx_enderecos_localizacao ON enderecos USING GIST (localizacao);

-- Garante que cada usuário tenha no máximo um endereço principal
CREATE UNIQUE INDEX uq_endereco_principal ON enderecos(usuario_id)
    WHERE principal = TRUE;

-- =============================================
-- CATEGORIAS DE ITENS
-- =============================================
CREATE TABLE categorias (
    id   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    nome VARCHAR(80) NOT NULL UNIQUE
);

-- =============================================
-- ITENS (objetos para aluguel)
-- =============================================
CREATE TABLE itens (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    usuario_id    UUID NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
    categoria_id  UUID REFERENCES categorias(id),
    -- [NOVO] vínculo direto com o endereço do item (um usuário pode ter vários endereços)
    endereco_id   UUID REFERENCES enderecos(id),
    titulo        VARCHAR(150) NOT NULL,
    descricao     TEXT,
    preco_por_dia DECIMAL(10,2) NOT NULL,
    valor_mercado DECIMAL(10,2) NOT NULL,
    disponivel    BOOLEAN DEFAULT TRUE,
    condicao      VARCHAR(20) CHECK (condicao IN ('Novo', 'Bom', 'Desgastado', 'Ruim')),
    segurado      BOOLEAN DEFAULT FALSE,
    criado_em     TIMESTAMP DEFAULT NOW(),
    atualizado_em TIMESTAMP DEFAULT NOW()
);

-- =============================================
-- FOTOS DOS ITENS
-- =============================================
CREATE TABLE fotos_item (
    id        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    item_id   UUID NOT NULL REFERENCES itens(id) ON DELETE CASCADE,
    url       TEXT NOT NULL,
    principal BOOLEAN DEFAULT FALSE
);

-- [NOVO] Garante que cada item tenha no máximo uma foto principal
CREATE UNIQUE INDEX uq_foto_principal ON fotos_item(item_id)
    WHERE principal = TRUE;

-- =============================================
-- ALUGUÉIS / RESERVAS
-- =============================================
CREATE TABLE alugueis (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    item_id         UUID NOT NULL REFERENCES itens(id),
    locatario_id    UUID NOT NULL REFERENCES usuarios(id),
    -- [NOVO] locador_id direto — evita JOIN em itens para queries do locador
    locador_id      UUID NOT NULL REFERENCES usuarios(id),
    data_inicio     DATE NOT NULL,
    data_fim        DATE NOT NULL,
    valor_total     DECIMAL(10,2) NOT NULL,
    taxa_plataforma DECIMAL(10,2) NOT NULL DEFAULT 0.00,
    ganho_locador   DECIMAL(10,2) NOT NULL DEFAULT 0.00,
    status          VARCHAR(30) DEFAULT 'pendente' CHECK (status IN (
                      'pendente','confirmado','ativo','concluido','cancelado'
                    )),
    criado_em       TIMESTAMP DEFAULT NOW(),
    atualizado_em   TIMESTAMP DEFAULT NOW(),
    -- Garante que a data de fim seja sempre após a data de início
    CONSTRAINT chk_datas CHECK (data_fim > data_inicio)
);

-- =============================================
-- PAGAMENTOS
-- =============================================
CREATE TABLE pagamentos (
    id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    aluguel_id UUID NOT NULL REFERENCES alugueis(id) ON DELETE CASCADE,
    valor      DECIMAL(10,2) NOT NULL,
    metodo     VARCHAR(50) CHECK (metodo IN ('cartao_credito','cartao_debito','pix','boleto')),
    status     VARCHAR(30) DEFAULT 'pendente' CHECK (status IN (
                 'pendente','aprovado','recusado','estornado'
               )),
    pago_em    TIMESTAMP
);

-- =============================================
-- EXTRATO DA CARTEIRA
-- =============================================
CREATE TABLE extrato_carteira (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    usuario_id    UUID NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
    valor         DECIMAL(10,2) NOT NULL,
    tipo          VARCHAR(50) CHECK (tipo IN ('entrada_aluguel','saque','pagamento_assinatura')),
    descricao     TEXT,
    referencia_id UUID,
    criado_em     TIMESTAMP DEFAULT NOW()
);

-- =============================================
-- SINISTROS (Seguro)
-- =============================================
CREATE TABLE sinistros (
    id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    aluguel_id       UUID NOT NULL REFERENCES alugueis(id),
    reportador_id    UUID NOT NULL REFERENCES usuarios(id),
    status           VARCHAR(30) DEFAULT 'aberto' CHECK (status IN (
                       'aberto','em_analise','aprovado','recusado','fechado'
                     )),
    descricao        TEXT NOT NULL,
    valor_solicitado DECIMAL(10,2),
    valor_aprovado   DECIMAL(10,2),
    notas_analise    TEXT,
    criado_em        TIMESTAMP DEFAULT NOW(),
    atualizado_em    TIMESTAMP DEFAULT NOW()
);

-- =============================================
-- FUNDO DE RESERVA (Caixa do Seguro)
-- =============================================
CREATE TABLE fundo_reserva (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    valor         DECIMAL(10,2) NOT NULL,
    tipo          VARCHAR(50) CHECK (tipo IN ('taxa_assinatura','pagamento_sinistro')),
    descricao     TEXT,
    referencia_id UUID,
    criado_em     TIMESTAMP DEFAULT NOW()
);

-- =============================================
-- MENSAGENS ENTRE USUÁRIOS
-- =============================================
CREATE TABLE mensagens (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    remetente_id    UUID NOT NULL REFERENCES usuarios(id),
    destinatario_id UUID NOT NULL REFERENCES usuarios(id),
    aluguel_id      UUID REFERENCES alugueis(id) ON DELETE CASCADE,
    conteudo        TEXT NOT NULL,
    lida            BOOLEAN DEFAULT FALSE,
    enviada_em      TIMESTAMP DEFAULT NOW()
);

-- [NOVO] Índices para queries de chat
CREATE INDEX idx_mensagens_remetente    ON mensagens(remetente_id);
CREATE INDEX idx_mensagens_destinatario ON mensagens(destinatario_id);
CREATE INDEX idx_mensagens_aluguel      ON mensagens(aluguel_id);

-- =============================================
-- AVALIAÇÕES
-- =============================================
CREATE TABLE avaliacoes (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    aluguel_id   UUID NOT NULL REFERENCES alugueis(id) ON DELETE CASCADE,
    avaliador_id UUID NOT NULL REFERENCES usuarios(id),
    avaliado_id  UUID NOT NULL REFERENCES usuarios(id),
    nota         SMALLINT CHECK (nota BETWEEN 1 AND 5),
    comentario   TEXT,
    criado_em    TIMESTAMP DEFAULT NOW(),
    -- [NOVO] Impede avaliação duplicada do mesmo aluguel pelo mesmo avaliador
    CONSTRAINT uq_avaliacao_aluguel_avaliador UNIQUE (aluguel_id, avaliador_id)
);

-- =============================================
-- NOTIFICAÇÕES
-- =============================================
CREATE TABLE notificacoes (
    id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    usuario_id UUID NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
    tipo       VARCHAR(50) CHECK (tipo IN ('aluguel','mensagem','pagamento','sistema')),
    titulo     VARCHAR(150),
    mensagem   TEXT,
    lida       BOOLEAN DEFAULT FALSE,
    criado_em  TIMESTAMP DEFAULT NOW()
);

-- =============================================
-- PLANOS DE ASSINATURA
-- =============================================
CREATE TABLE planos (
    id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    nome       VARCHAR(80) NOT NULL,
    preco      DECIMAL(10,2) NOT NULL,
    descricao  TEXT,
    beneficios TEXT[]
);

-- =============================================
-- ASSINATURAS DOS USUÁRIOS
-- =============================================
CREATE TABLE assinaturas (
    id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    usuario_id UUID NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
    plano_id   UUID NOT NULL REFERENCES planos(id),
    status     VARCHAR(30) DEFAULT 'ativa' CHECK (status IN ('ativa','cancelada','expirada')),
    inicio     DATE NOT NULL,
    fim        DATE,
    criado_em  TIMESTAMP DEFAULT NOW()
);

-- =============================================
-- VERIFICAÇÃO DE IDENTIDADE
-- =============================================
CREATE TABLE verificacoes_identidade (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    usuario_id   UUID NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
    tipo         VARCHAR(50) CHECK (tipo IN (
                   'selfie','documento_frente','documento_verso','comprovante_residencia'
                 )),
    foto_url     TEXT,
    status       VARCHAR(30) DEFAULT 'pendente' CHECK (status IN ('pendente','aprovado','recusado')),
    analisado_em TIMESTAMP,
    criado_em    TIMESTAMP DEFAULT NOW()
);

-- =============================================
-- TRIGGERS DE ATUALIZAÇÃO AUTOMÁTICA
-- =============================================
CREATE OR REPLACE FUNCTION atualiza_timestamp()
RETURNS TRIGGER AS $$
BEGIN
    NEW.atualizado_em = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_atualiza_usuarios
    BEFORE UPDATE ON usuarios
    FOR EACH ROW EXECUTE PROCEDURE atualiza_timestamp();

CREATE TRIGGER trigger_atualiza_itens
    BEFORE UPDATE ON itens
    FOR EACH ROW EXECUTE PROCEDURE atualiza_timestamp();

CREATE TRIGGER trigger_atualiza_alugueis
    BEFORE UPDATE ON alugueis
    FOR EACH ROW EXECUTE PROCEDURE atualiza_timestamp();

CREATE TRIGGER trigger_atualiza_sinistros
    BEFORE UPDATE ON sinistros
    FOR EACH ROW EXECUTE PROCEDURE atualiza_timestamp();

-- =============================================
-- VIEWS
-- =============================================

-- [CORRIGIDO] Sem duplicação por múltiplos endereços — usa o endereço do item diretamente
CREATE VIEW view_itens_home AS
SELECT
    i.id,
    i.titulo,
    i.descricao,
    i.preco_por_dia,
    i.segurado,
    i.condicao,
    c.nome          AS categoria,
    e.cidade,
    e.estado,
    e.localizacao,
    f.url           AS foto_principal,
    u.nome          AS dono_nome,
    u.verificado    AS dono_verificado
FROM itens i
JOIN usuarios u    ON u.id = i.usuario_id
JOIN categorias c  ON c.id = i.categoria_id
LEFT JOIN enderecos e   ON e.id = i.endereco_id
LEFT JOIN fotos_item f  ON f.item_id = i.id AND f.principal = TRUE
WHERE i.disponivel = TRUE;

-- View para busca por proximidade (recebe lat/lng como parâmetro na query)
-- Exemplo de uso:
-- SELECT * FROM view_itens_home
-- WHERE ST_DWithin(localizacao, ST_MakePoint(-46.65, -23.56)::geography, 5000)
-- ORDER BY ST_Distance(localizacao, ST_MakePoint(-46.65, -23.56)::geography);