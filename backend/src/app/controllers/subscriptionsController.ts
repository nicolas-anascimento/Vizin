import type { RequestHandler } from "express";
import prisma from "../config/database.ts";
import { HttpError } from "../utils/httpError.ts";
import { text, uuid } from "../utils/validation.ts";
import { MercadoPagoGateway, providerId, verifyMercadoPagoSignature } from "../services/mercadoPagoGateway.ts";
import { addUtcMonth, expireSubscriptions, publicationContext, subscriptionDto } from "../services/subscriptionService.ts";
import { idempotencyKeySchema, subscriptionBodySchema, subscriptionWebhookSchema } from "../schemas/subscriptions.schema.ts";
import { validatedPart } from "../middlewares/validate.ts";

function operationKey(req: Parameters<RequestHandler>[0]): string {
  const key = req.get("Idempotency-Key")?.trim();
  const parsed = idempotencyKeySchema.safeParse(key);
  if (!parsed.success) throw new HttpError(422, "Idempotency-Key é obrigatório e inválido", "idempotencia_obrigatoria");
  return `assinatura:${req.user!.id}:${parsed.data}`;
}

function paymentDto(row: any) {
  const data = row.dados && typeof row.dados === "object" ? row.dados : {};
  return {
    id: row.id,
    assinatura_id: row.assinatura_id,
    plano: row.plano ? { codigo: row.plano.codigo, nome: row.plano.nome, preco_centavos: row.valor_centavos } : undefined,
    valor_centavos: row.valor_centavos,
    valor: row.valor_centavos / 100,
    status: row.status,
    provedor: row.provedor,
    metodo: row.metodo,
    criado_em: row.criado_em,
    confirmado_em: row.confirmado_em,
    ...(typeof data.codigo_copia_cola === "string" ? { pix: { copia_e_cola: data.codigo_copia_cola, qr_code_base64: data.qr_code_base64 ?? null, expira_em: data.expira_em ?? null } } : {}),
  };
}

export const listPlans: RequestHandler = async (_req, res) => {
  const rows = await prisma.planos.findMany({ where: { ativo: true, codigo: { in: ["gratuito", "intermediario", "avancado"] } }, orderBy: { preco_centavos: "asc" } });
  res.json(rows.map(row => ({ id: row.id, codigo: row.codigo, nome: row.nome, preco_centavos: row.preco_centavos, preco_mensal: row.preco_centavos / 100, limite_publicacoes: row.limite_publicacoes, periodo: row.periodo, status: row.ativo ? "ativo" : "inativo", descricao: row.descricao, beneficios: row.beneficios })));
};

export const mySubscription: RequestHandler = async (req, res) => {
  await expireSubscriptions();
  res.json(subscriptionDto(await publicationContext(req.user!.id)));
};

export const myPublications: RequestHandler = mySubscription;

export const getSubscription: RequestHandler = async (req, res) => {
  await expireSubscriptions();
  const row = await prisma.assinaturas.findUnique({ where: { id: uuid(req.params.id) }, include: { planos: true } });
  if (!row) throw new HttpError(404, "Assinatura não encontrada", "nao_encontrada");
  if (row.usuario_id !== req.user!.id && req.user!.tipo !== "admin") throw new HttpError(403, "Acesso negado", "nao_pertence");
  if (!row.fim) throw new HttpError(409, "Período da assinatura indisponível");
  const utilizadas = await prisma.publicacoes_anuncio.count({ where: { assinatura_id: row.id } });
  res.json(subscriptionDto({ plano: row.planos, assinatura: row, periodo: { inicio: row.inicio, fim: row.fim }, utilizadas, disponiveis: Math.max(0, row.planos.limite_publicacoes - utilizadas) }));
};

// Cria apenas uma cobrança avulsa mensal. A recorrência automática não é simulada:
// o benefício só é ativado pelo webhook autenticado após consulta ao Mercado Pago.
export const createSubscription: RequestHandler = async (req, res) => {
  // Não grave uma intenção financeira que não pode ser criada ou confirmada.
  if (!process.env.MP_ACCESS_TOKEN?.trim() || !process.env.MP_WEBHOOK_SECRET?.trim() || !process.env.MP_NOTIFICATION_URL?.trim()) {
    throw new HttpError(503, "Mercado Pago incompleto: configure token, segredo do webhook e URL de notificação", "mercado_pago_nao_configurado");
  }
  await expireSubscriptions();
  const input = validatedPart(req, "body", subscriptionBodySchema);
  const codigo = (input.plano_codigo ?? input.plano)!.toLowerCase();
  if (codigo === "gratuito") throw new HttpError(422, "O plano Gratuito é aplicado automaticamente");
  const plano = await prisma.planos.findFirst({ where: { codigo, ativo: true } });
  if (!plano || !["intermediario", "avancado"].includes(plano.codigo)) throw new HttpError(404, "Plano não encontrado");
  const metodo = input.metodo ?? "pix";
  if (!["pix", "cartao"].includes(metodo)) throw new HttpError(422, "Método de pagamento inválido");
  const key = operationKey(req);
  const user = await prisma.usuarios.findUniqueOrThrow({ where: { id: req.user!.id } });
  if (!user.ativo) throw new HttpError(403, "Conta suspensa");
  if (!user.cpf) throw new HttpError(422, "Cadastre seu CPF antes de contratar um plano", "cadastro_incompleto");
  const intent = await prisma.$transaction(async tx => {
    await tx.$queryRaw`SELECT id FROM usuarios WHERE id=${user.id}::uuid FOR UPDATE`;
    const repeated = await tx.pagamentos_assinatura.findUnique({ where: { chave_idempotencia: key }, include: { plano: true } });
    if (repeated) {
      if (repeated.plano_id !== plano.id || repeated.metodo !== metodo) throw new HttpError(409, "Chave reutilizada com contratação diferente", "idempotencia_conflitante");
      return repeated;
    }
    const current = await tx.assinaturas.findFirst({
      where: {
        usuario_id: user.id,
        status: { in: ["pendente", "ativa"] },
        planos: { codigo: { in: ["intermediario", "avancado"] } },
      },
    });
    if (current) throw new HttpError(409, current.status === "ativa" ? "Já existe um plano pago vigente" : "Já existe uma contratação pendente", "assinatura_existente");
    const start = new Date();
    const subscription = await tx.assinaturas.create({ data: { usuario_id: user.id, plano_id: plano.id, status: "pendente", inicio: start, fim: addUtcMonth(start), renovacao_habilitada: false } });
    return tx.pagamentos_assinatura.create({ data: { assinatura_id: subscription.id, usuario_id: user.id, plano_id: plano.id, valor_centavos: plano.preco_centavos, status: "pendente", provedor: "mercado_pago", chave_idempotencia: key, metodo }, include: { plano: true } });
  }, { isolationLevel: "ReadCommitted" });

  if (intent.status !== "pendente" || intent.referencia_pagamento) {
    let current = intent;
    if (intent.status === "pendente" && intent.referencia_pagamento && metodo === "pix" && !paymentDto(intent).pix) {
      await applyTrustedPayment(intent.id, await new MercadoPagoGateway().payment(intent.referencia_pagamento));
      current = await prisma.pagamentos_assinatura.findUniqueOrThrow({ where: { id: intent.id }, include: { plano: true } });
    }
    res.status(current.status === "pendente" ? 202 : 200).json(paymentDto(current)); return;
  }

  let gateway;
  try {
    gateway = await new MercadoPagoGateway().request("payments", {
      id: intent.id,
      valor: intent.valor_centavos / 100,
      tipo: "assinatura",
      metodo,
      assinaturaId: intent.assinatura_id,
      plano_codigo: plano.codigo,
      pagador: { id: user.id, email: user.email, cpf: user.cpf.replace(/\D/g, ""), nome: user.nome, customer_id: user.mercado_pago_customer_id ?? undefined },
      ...(metodo === "cartao" ? { tokenCartao: text(input.token_cartao, "Token do cartão", 300), payment_method_id: text(input.payment_method_id, "Bandeira", 80), device_id: input.device_id } : { expira_em: new Date(Date.now() + 31 * 60000).toISOString() }),
    }, key);
  } catch (error) {
    // Um timeout pode ocorrer depois que o provedor criou a cobrança. Manter
    // a intenção pendente evita uma segunda contratação com outra chave.
    if (error instanceof HttpError && error.status === 422) {
      await prisma.$transaction([prisma.pagamentos_assinatura.update({ where: { id: intent.id }, data: { status: "falhou" } }), prisma.assinaturas.update({ where: { id: intent.assinatura_id }, data: { status: "falha" } })]);
    }
    throw error;
  }
  await prisma.pagamentos_assinatura.updateMany({ where: { id: intent.id, status: "pendente" }, data: { referencia_pagamento: gateway.referencia, status: gateway.status === "falhou" ? "falhou" : "pendente", dados: { codigo_copia_cola: gateway.codigo_copia_cola, qr_code_base64: gateway.qr_code_base64, expira_em: gateway.expira_em } } });
  if (gateway.status === "falhou") await prisma.assinaturas.updateMany({ where: { id: intent.assinatura_id, status: "pendente" }, data: { status: "falha" } });
  const updated = await prisma.pagamentos_assinatura.findUniqueOrThrow({ where: { id: intent.id }, include: { plano: true } });
  res.status(202).json(paymentDto(updated));
};

export const cancelSubscription: RequestHandler = async (req, res) => {
  const id = uuid(req.params.id);
  const row = await prisma.assinaturas.findUnique({ where: { id } });
  if (!row) throw new HttpError(404, "Assinatura não encontrada");
  if (row.usuario_id !== req.user!.id) throw new HttpError(403, "Acesso negado");
  if (row.status !== "ativa") throw new HttpError(409, "A assinatura não está ativa");
  const updated = await prisma.$transaction(async tx => {
    await tx.$queryRaw`SELECT id FROM assinaturas WHERE id=${id}::uuid FOR UPDATE`;
    const current = await tx.assinaturas.findUniqueOrThrow({ where: { id } });
    if (current.cancelar_ao_final) return current;
    const result = await tx.assinaturas.update({ where: { id }, data: { cancelar_ao_final: true, renovacao_habilitada: false, proxima_cobranca: null } });
    await tx.notificacoes.createMany({ skipDuplicates: true, data: [{ usuario_id: row.usuario_id, chave: `assinatura_renovacao_cancelada:${id}`, tipo: "assinatura_renovacao_cancelada", titulo: "Período seguinte desativado", mensagem: "Nenhuma renovação automática está programada. Seu plano continua ativo até o fim do período já pago.", contexto: { assinatura_id: id, fim_periodo: row.fim } }] });
    return result;
  });
  res.json({ success: true, id: updated.id, status: updated.status, cancelar_ao_final: updated.cancelar_ao_final, fim_periodo: updated.fim });
};

export const subscriptionPayment: RequestHandler = async (req, res) => {
  let row = await prisma.pagamentos_assinatura.findUnique({ where: { id: uuid(req.params.id) }, include: { plano: true } });
  if (!row) throw new HttpError(404, "Pagamento não encontrado");
  if (row.usuario_id !== req.user!.id && req.user!.tipo !== "admin") throw new HttpError(403, "Acesso negado");
  if (row.status === "pendente") {
    const gateway = new MercadoPagoGateway();
    const trusted = row.referencia_pagamento
      ? await gateway.payment(row.referencia_pagamento)
      : await gateway.findPayment(row.id);
    if (trusted) {
      await applyTrustedPayment(row.id, trusted);
      row = await prisma.pagamentos_assinatura.findUniqueOrThrow({ where: { id: row.id }, include: { plano: true } });
    }
  }
  res.json(paymentDto(row));
};

async function applyTrustedPayment(paymentId: string, trusted: Awaited<ReturnType<MercadoPagoGateway["payment"]>>) {
  return prisma.$transaction(async tx => {
    const owner = await tx.pagamentos_assinatura.findUnique({ where: { id: paymentId }, select: { usuario_id: true } });
    if (!owner) return false;
    await tx.$queryRaw`SELECT id FROM usuarios WHERE id=${owner.usuario_id}::uuid FOR UPDATE`;
    await tx.$queryRaw`SELECT id FROM pagamentos_assinatura WHERE id=${paymentId}::uuid FOR UPDATE`;
    const payment = await tx.pagamentos_assinatura.findUnique({ where: { id: paymentId }, include: { plano: true, assinatura: true } });
    if (!payment) return false;
    const metadata = trusted.metadata;
    if (trusted.external_reference !== payment.id || trusted.valor !== payment.valor_centavos / 100 || trusted.moeda !== "BRL" || (payment.referencia_pagamento !== null && trusted.referencia !== payment.referencia_pagamento)
      || metadata?.pagamento_assinatura_id !== payment.id || metadata?.assinatura_id !== payment.assinatura_id
      || metadata?.usuario_id !== payment.usuario_id || metadata?.plano_codigo !== payment.plano.codigo || metadata?.tipo !== "assinatura") {
      throw new HttpError(422, "Pagamento do provedor diverge da contratação");
    }
    if (payment.assinatura.usuario_id !== payment.usuario_id || payment.assinatura.plano_id !== payment.plano_id) throw new HttpError(409, "Integridade da assinatura inválida");
    if (payment.status === "pago") {
      if (trusted.status === "estornado" || trusted.status === "cancelado") {
        await tx.pagamentos_assinatura.update({ where: { id: payment.id }, data: { status: trusted.status } });
        await tx.assinaturas.updateMany({ where: { id: payment.assinatura_id, status: "ativa" }, data: { status: "cancelada", renovacao_habilitada: false, proxima_cobranca: null } });
        await tx.notificacoes.createMany({ skipDuplicates: true, data: [{ usuario_id: payment.usuario_id, chave: `assinatura_pagamento_revertido:${payment.id}`, tipo: "assinatura_pagamento_revertido", titulo: "Pagamento do plano revertido", mensagem: "O pagamento do plano foi revertido; novas publicações seguem o plano Gratuito.", contexto: { assinatura_id: payment.assinatura_id, pagamento_id: payment.id } }] });
      }
      return true;
    }
    if (["estornado", "cancelado"].includes(payment.status)) {
      if (trusted.status === "pago") throw new HttpError(409, "Transição financeira exige conciliação", "pagamento_conflitante");
      return true;
    }
    if (trusted.status === "pago") {
      const competing = await tx.assinaturas.findFirst({ where: { usuario_id: payment.usuario_id, id: { not: payment.assinatura_id }, status: { in: ["pendente", "ativa"] }, planos: { codigo: { in: ["intermediario", "avancado"] } } }, select: { id: true } });
      if (competing) throw new HttpError(409, "Pagamento confirmado com outra contratação em andamento; exige conciliação", "assinatura_concorrente");
      const now = new Date();
      const start = now;
      await tx.pagamentos_assinatura.update({ where: { id: payment.id }, data: { status: "pago", confirmado_em: now, referencia_pagamento: trusted.referencia } });
      await tx.assinaturas.update({ where: { id: payment.assinatura_id }, data: { status: "ativa", inicio: start, fim: addUtcMonth(start), cancelar_ao_final: false, renovacao_habilitada: false, proxima_cobranca: null, referencia_provedor: trusted.referencia } });
      await tx.notificacoes.createMany({ skipDuplicates: true, data: [{ usuario_id: payment.usuario_id, chave: `assinatura_ativada:${payment.id}`, tipo: "assinatura_ativada", titulo: "Plano ativado", mensagem: `Seu plano ${payment.plano.nome} está ativo.`, contexto: { assinatura_id: payment.assinatura_id, pagamento_id: payment.id } }] });
      await tx.notificacoes_admin.upsert({ where: { chave_deduplicacao: `assinatura_pagamento:${payment.id}:pago` }, create: { tipo: "assinatura_pagamento_confirmado", categoria: "pagamentos", prioridade: "normal", titulo: "Pagamento de plano confirmado", mensagem: `O plano ${payment.plano.nome} foi ativado.`, referencia_tipo: "pagamento_assinatura", referencia_id: payment.id, chave_deduplicacao: `assinatura_pagamento:${payment.id}:pago` }, update: {} });
      return true;
    }
    if (["falhou", "cancelado", "estornado"].includes(trusted.status)) {
      await tx.pagamentos_assinatura.update({ where: { id: payment.id }, data: { status: trusted.status, referencia_pagamento: trusted.referencia } });
      await tx.assinaturas.updateMany({ where: { id: payment.assinatura_id, status: "pendente" }, data: { status: trusted.status === "falhou" ? "falha" : "cancelada" } });
      if (trusted.status === "falhou") await tx.notificacoes.createMany({ skipDuplicates: true, data: [{ usuario_id: payment.usuario_id, chave: `assinatura_pagamento_recusado:${payment.id}`, tipo: "assinatura_pagamento_recusado", titulo: "Pagamento não aprovado", mensagem: "O plano pago não foi ativado.", contexto: { assinatura_id: payment.assinatura_id } }] });
      if (trusted.status === "falhou") await tx.notificacoes_admin.upsert({ where: { chave_deduplicacao: `assinatura_pagamento:${payment.id}:falhou` }, create: { tipo: "assinatura_pagamento_recusado", categoria: "pagamentos", prioridade: "alta", titulo: "Pagamento de plano recusado", mensagem: `A cobrança do plano ${payment.plano.nome} não foi aprovada.`, referencia_tipo: "pagamento_assinatura", referencia_id: payment.id, chave_deduplicacao: `assinatura_pagamento:${payment.id}:falhou` }, update: {} });
    }
    if (trusted.status === "pendente" && (!payment.referencia_pagamento || !(payment.dados as Record<string, unknown>)?.codigo_copia_cola)) {
      await tx.pagamentos_assinatura.update({ where: { id: payment.id }, data: { referencia_pagamento: trusted.referencia, dados: { codigo_copia_cola: trusted.codigo_copia_cola, qr_code_base64: trusted.qr_code_base64, expira_em: trusted.expira_em } } });
    }
    return true;
  });
}

export const subscriptionWebhook: RequestHandler = async (req, res) => {
  if (!Buffer.isBuffer(req.body)) throw new HttpError(400, "Corpo inválido");
  let payload: unknown; try { payload = JSON.parse(req.body.toString("utf8")); } catch { throw new HttpError(400, "JSON inválido"); }
  const verified = verifyMercadoPagoSignature(req.query["data.id"], req.headers["x-signature"], req.headers["x-request-id"]);
  const parsed = subscriptionWebhookSchema.safeParse(payload);
  if (!parsed.success) throw new HttpError(422, "Notificação incompatível");
  const input = parsed.data;
  if (input.type !== "payment" || String(input.data.id) !== verified.resourceId) throw new HttpError(422, "Notificação incompatível");
  const eventId = `assinatura:mp:${providerId(input.id)}`;
  const stored = await prisma.webhook_eventos.upsert({ where: { id: eventId }, create: { id: eventId, payload: { provider: "mercado_pago", resourceId: verified.resourceId, purpose: "subscription" } }, update: {} });
  const storedPayload = stored.payload && typeof stored.payload === "object" && !Array.isArray(stored.payload) ? stored.payload as Record<string, unknown> : {};
  if (storedPayload.resourceId !== verified.resourceId || storedPayload.purpose !== "subscription") throw new HttpError(409, "ID de notificação reutilizado com recurso diferente");
  if (stored.processado_em) { res.json({ success: true }); return; }
  const trusted = await new MercadoPagoGateway().payment(verified.resourceId);
  const localId = typeof trusted.external_reference === "string" ? trusted.external_reference : "";
  const payment = /^[0-9a-f-]{36}$/i.test(localId) ? await prisma.pagamentos_assinatura.findUnique({ where: { id: localId } }) : null;
  if (!payment) { res.status(202).json({ success: true, pendente: true }); return; }
  await applyTrustedPayment(payment.id, trusted);
  await prisma.webhook_eventos.update({ where: { id: eventId }, data: { processado_em: new Date(), lease_ate: null } });
  res.json({ success: true });
};

export { applyTrustedPayment };
