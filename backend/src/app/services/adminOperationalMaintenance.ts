import prisma from "../config/database.ts";

type AlertReference = { id: string };

// Materializa apenas alertas com evidência objetiva. As consultas ignoram chaves já
// persistidas para que um lote antigo não impeça o processamento dos seguintes. A
// restrição única de chave continua sendo a barreira final entre instâncias concorrentes.
export async function processAdminOperationalAlerts(): Promise<void> {
  const now = new Date();
  const criticalCutoff = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  const verificationCutoff = new Date(now.getTime() - 48 * 60 * 60 * 1000);
  const [reports, supports, repeatUsers, reportedItems, delayedVerifications] = await Promise.all([
    prisma.$queryRaw<AlertReference[]>`
      SELECT d.id
      FROM denuncias d
      WHERE d.prioridade = 'critica'
        AND d.criado_em < ${criticalCutoff}
        AND d.status IN ('aberta', 'aberto', 'andamento', 'em_analise')
        AND NOT EXISTS (SELECT 1 FROM respostas_ocorrencia r WHERE r.denuncia_id = d.id)
        AND NOT EXISTS (SELECT 1 FROM notificacoes_admin n WHERE n.chave_deduplicacao = 'ocorrencia_critica_24h:' || d.id::text)
      ORDER BY d.id LIMIT 100`,
    prisma.$queryRaw<AlertReference[]>`
      SELECT s.id
      FROM suportes s
      WHERE s.prioridade = 'critica'
        AND s.criado_em < ${criticalCutoff}
        AND s.status IN ('aberta', 'aberto', 'andamento', 'em_analise')
        AND NOT EXISTS (SELECT 1 FROM respostas_ocorrencia r WHERE r.suporte_id = s.id)
        AND NOT EXISTS (SELECT 1 FROM notificacoes_admin n WHERE n.chave_deduplicacao = 'ocorrencia_critica_24h:' || s.id::text)
      ORDER BY s.id LIMIT 100`,
    prisma.$queryRaw<AlertReference[]>`
      SELECT d.denunciado_id AS id
      FROM denuncias d
      WHERE d.denunciado_id IS NOT NULL
        AND d.motivo <> 'retirada_evidencia_unilateral'
        AND NOT EXISTS (
          SELECT 1 FROM notificacoes_admin n
          WHERE n.chave_deduplicacao = 'usuario_reincidente:' || d.denunciado_id::text
        )
      GROUP BY d.denunciado_id
      HAVING COUNT(*) >= 3
      ORDER BY d.denunciado_id
      LIMIT 100`,
    prisma.$queryRaw<AlertReference[]>`
      SELECT d.objeto_id AS id
      FROM denuncias d
      WHERE d.objeto_id IS NOT NULL
        AND d.motivo <> 'retirada_evidencia_unilateral'
        AND NOT EXISTS (
          SELECT 1 FROM notificacoes_admin n
          WHERE n.chave_deduplicacao = 'anuncio_muito_denunciado:' || d.objeto_id::text
        )
      GROUP BY d.objeto_id
      HAVING COUNT(*) >= 3
      ORDER BY d.objeto_id
      LIMIT 100`,
    prisma.$queryRaw<AlertReference[]>`
      SELECT v.id
      FROM verificacoes_identidade v
      WHERE v.status = 'pendente'
        AND v.criado_em < ${verificationCutoff}
        AND NOT EXISTS (
          SELECT 1 FROM notificacoes_admin n
          WHERE n.chave_deduplicacao = 'verificacao_atrasada:' || v.id::text
        )
      ORDER BY v.id
      LIMIT 100`,
  ]);
  await prisma.notificacoes_admin.createMany({
    skipDuplicates: true,
    data: [
      ...[...reports, ...supports].map(row => ({ tipo: "denuncia_critica_sem_resposta", categoria: "denuncias", prioridade: "alta", titulo: "Ocorrência crítica sem resposta", mensagem: "Uma ocorrência crítica está sem resposta há mais de 24 horas.", referencia_tipo: "ocorrencia", referencia_id: row.id, chave_deduplicacao: `ocorrencia_critica_24h:${row.id}` })),
      ...repeatUsers.map(row => ({ tipo: "usuario_reincidente", categoria: "usuarios", prioridade: "alta", titulo: "Usuário reincidente", mensagem: "Um usuário atingiu três denúncias recebidas e requer análise.", referencia_tipo: "usuario", referencia_id: row.id, chave_deduplicacao: `usuario_reincidente:${row.id}` })),
      ...reportedItems.map(row => ({ tipo: "anuncio_muito_denunciado", categoria: "anuncios", prioridade: "alta", titulo: "Anúncio muito denunciado", mensagem: "Um objeto atingiu três denúncias e requer moderação.", referencia_tipo: "objeto", referencia_id: row.id, chave_deduplicacao: `anuncio_muito_denunciado:${row.id}` })),
      ...delayedVerifications.map(row => ({ tipo: "verificacao_atrasada", categoria: "verificacoes", prioridade: "alta", titulo: "Verificação atrasada", mensagem: "Uma verificação permanece pendente há mais de 48 horas.", referencia_tipo: "verificacao", referencia_id: row.id, chave_deduplicacao: `verificacao_atrasada:${row.id}` })),
    ],
  });
}
