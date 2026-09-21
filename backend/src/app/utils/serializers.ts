import { contractedPrice, isExpiredPix } from "../services/paymentRules.ts";
import { HttpError } from "./httpError.ts";
import { formatBr, rentalDays } from "./dates.ts";
import { initials } from "./strings.ts";

type DecimalLike = { toString(): string } | number | string;
const money = (value: DecimalLike | null | undefined): number => Number(value ?? 0);
function paymentAction(value: unknown): { tipo: "3ds"; url: string; creq?: string } | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const action = value as Record<string, unknown>;
  if (action.tipo !== "3ds" || typeof action.url !== "string") return undefined;
  return { tipo: "3ds", url: action.url, ...(typeof action.creq === "string" ? { creq: action.creq } : {}) };
}

// Converte relações e valores do Prisma para o contrato público de objeto da API.
export function serializeItem(item: any): Record<string, unknown> {
  const photos = Array.isArray(item.fotos_item)
    ? [...item.fotos_item].sort((a, b) => Number(Boolean(b.principal)) - Number(Boolean(a.principal)))
    : [];
  const owner = item.usuarios;
  const ratingRows = owner?.avaliacoes_avaliacoes_avaliado_idTousuarios ?? [];
  const rating = ratingRows.length
    ? ratingRows.reduce((sum: number, row: any) => sum + Number(row.nota ?? 0), 0) / ratingRows.length
    : 0;
  const objectReviews = item.avaliacoes ?? [];
  const objectRating = objectReviews.length ? objectReviews.reduce((sum: number, r: any) => sum + Number(r.nota), 0) / objectReviews.length : 0;
  const category = item.categorias?.nome ?? "Sem categoria";
  const image = photos[0]?.url ?? "/assets/img/sem-imagem.png";
  const location = item.localizacao_texto ?? item.enderecos?.cidade ?? "Não informado";
  return {
    id: item.id,
    nome: item.titulo,
    titulo: item.titulo,
    descricao: item.descricao ?? "",
    categoria: item.categorias ? { id: item.categorias.id, nome: item.categorias.nome, slug: item.categorias.slug } : null,
    categoria_nome: category,
    categoria_id: item.categoria_id,
    preco: money(item.preco_por_dia),
    preco_dia: money(item.preco_por_dia),
    preco_por_dia: money(item.preco_por_dia),
    valor_mercado: money(item.valor_mercado),
    localizacao: location,
    localizacao_texto: location,
    disponivel: item.disponivel ?? true,
    disponivel_imediato: item.disponivel ?? true,
    condicao: item.condicao,
    segurado: item.segurado ?? false,
    imagem: image,
    fotos: photos.map((photo: any) => ({ id: photo.id, url: photo.url, principal: photo.principal ?? false })),
    media: Number(objectRating.toFixed(1)),
    avaliacaoTotal: objectReviews.length,
    imagens: photos.map((photo: any) => photo.url),
    proprietarioId: item.usuario_id,
    proprietarioNome: owner?.nome,
    categoria_slug: item.categorias?.slug,
    endereco_id: item.endereco_id,
    proprietario: owner
      ? {
          id: owner.id,
          nome: owner.nome,
          iniciais: initials(owner.nome),
          avatarUrl: owner.foto_url ?? null,
          avaliacao: Number(rating.toFixed(1)),
        }
      : undefined,
  };
}

// Uniformiza contexto e campos de uma notificação para a interface.
export function serializeNotification(notification: any): Record<string, unknown> {
  return {
    id: notification.id,
    tipo: ({solicitacao:"solicitacao_aluguel",avaliacao:"avaliacao_recebida",mensagem:"mensagem"} as Record<string,string>)[notification.tipo] ?? notification.tipo ?? "geral",
    tipo_canonico: notification.tipo ?? "geral",
    titulo: notification.titulo ?? "Notificação",
    descricao: notification.mensagem ?? "",
    mensagem: notification.mensagem ?? "",
    ...notification.contexto,
    solicitacao_id: notification.contexto?.solicitacao_id ?? notification.contexto?.solicitacaoId ?? notification.contexto?.aluguelId ?? null,
    data: notification.criado_em?.toISOString?.() ?? notification.criado_em,
    lida: notification.lida ?? false,
  };
}

// Reúne objeto, participantes, preço, datas, multa e status no DTO de solicitação.
export function serializeRental(rental: any): Record<string, unknown> {
  const price = contractedPrice(rental);
  const photos = rental.itens?.fotos_item ?? [];
  const fine = rental.multa;
  return {
    id: rental.id,
    status: rental.status,
    status_canonico: rental.status,
    status_frontend: ({ recusado: "rejeitado", finalizado: "concluido", devolvido: "concluido" } as Record<string,string>)[rental.status] ?? rental.status,
    solicitacao_id: rental.id,
    produtoId: rental.item_id,
    produtoTitulo: rental.itens?.titulo,
    proprietarioNome: rental.usuarios_alugueis_locador_idTousuarios?.nome,
    solicitanteNome: rental.usuarios_alugueis_locatario_idTousuarios?.nome,
    dataRetirada: rental.data_inicio?.toISOString?.().slice(0,10),
    dataDevolucao: rental.data_fim?.toISOString?.().slice(0,10),
    criadoEm: rental.criado_em,
    aluguelId: rental.id,
    objeto_id: rental.item_id,
    proprietarioId: rental.locador_id,
    solicitanteId: rental.locatario_id,
    data_inicio: rental.data_inicio?.toISOString?.().slice(0, 10),
    data_fim: rental.data_fim?.toISOString?.().slice(0, 10),
    data_retirada: rental.data_inicio?.toISOString?.().slice(0, 10),
    data_devolucao: rental.data_fim?.toISOString?.().slice(0, 10),
    valor_total: money(rental.valor_total),
    subtotal: price.subtotal,
    taxa_servico: price.taxa_servico,
    expira_em: rental.expira_em,
    pagamento_ate: rental.pagamento_ate,
    total: price.total,
    retirada: rental.data_inicio?.toISOString?.().slice(0, 10),
    devolucao: rental.data_fim?.toISOString?.().slice(0, 10),
    dias: rentalDays(rental.data_inicio, rental.data_fim),
    produto: rental.itens ? { id: rental.itens.id, titulo: rental.itens.titulo, imagem: photos.find((f: any) => f.principal)?.url ?? photos[0]?.url ?? null, categoria: rental.itens.categorias?.nome ?? null } : undefined,
    proprietario: rental.usuarios_alugueis_locador_idTousuarios ? { id: rental.locador_id, nome: rental.usuarios_alugueis_locador_idTousuarios.nome } : undefined,
    solicitante: rental.usuarios_alugueis_locatario_idTousuarios ? { id: rental.locatario_id, nome: rental.usuarios_alugueis_locatario_idTousuarios.nome } : undefined,
    cancelado_por: rental.cancelado_por ?? null,
    multa: fine ? { status: fine.status, dias_atraso: fine.dias_atraso, valor_dia: money(fine.valor_dia), valor_total: money(fine.valor_total), valor_plataforma: money(fine.valor_plataforma), valor_proprietario: money(fine.valor_proprietario), calculado_em: fine.calculado_em } : null,
    objeto: rental.itens ? serializeItem(rental.itens) : undefined,
    locador: rental.usuarios_alugueis_locador_idTousuarios ? serializeUser(rental.usuarios_alugueis_locador_idTousuarios) : undefined,
    locatario: rental.usuarios_alugueis_locatario_idTousuarios ? serializeUser(rental.usuarios_alugueis_locatario_idTousuarios) : undefined,
    pagamentos: (rental.pagamentos ?? []).map((p: any) => ({ tipo: p.tipo, status: p.status })),
  };
}

// Monta perfil público ou privado e agrega avaliações e atividade do usuário.
export function serializeProfile(user: any, includePrivate = false): Record<string, unknown> {
  const allReviews = user.avaliacoes_avaliacoes_avaliado_idTousuarios ?? [];
  const reviews = allReviews.filter((r: any) => r.contexto !== "objeto");
  const ownerReviews = allReviews.filter((r: any) => r.contexto === "objeto");
  const ownerAverage = ownerReviews.length ? ownerReviews.reduce((sum: number, r: any) => sum + Number(r.nota),0) / ownerReviews.length : 0;
  const average = reviews.length
    ? reviews.reduce((sum: number, review: any) => sum + Number(review.nota ?? 0), 0) / reviews.length
    : 0;
  const completedRentals = (user.alugueis_alugueis_locatario_idTousuarios ?? []).filter(
    (rental: any) => ["finalizado", "devolvido"].includes(rental.status ?? ""),
  ).length;
  const received = user.alugueis_alugueis_locador_idTousuarios ?? [];
  const answered = received.filter((r: any) => !["pendente", "cancelado"].includes(r.status)).length;
  return {
    id: user.id,
    nome: user.nome,
    ...(includePrivate ? { email: user.email, cpf: user.cpf, telefone: user.telefone, whatsapp: user.telefone, preferenciasNotificacao: user.preferencias, privacidade: user.privacidade } : {}),
    bio: user.bio ?? "",
    avatarUrl: user.foto_url,
    avaliacaoMedia: Number(average.toFixed(1)),
    avaliacaoTotal: reviews.length,
    avaliacaoProprietarioMedia: Number(ownerAverage.toFixed(1)),
    avaliacaoProprietarioTotal: ownerReviews.length,
    membroDesde: formatBr(user.criado_em),
    verificado: user.verificado ?? false,
    ativo: user.ativo,
    stats: {
      alugados: completedRentals,
      anunciados: user._count?.itens ?? user.itens?.length ?? 0,
      taxaResposta: received.length ? Math.round(answered / received.length * 100) : 0,
    },
    avaliacoes: reviews.map((review: any) => ({
      id: review.id,
      nome: review.usuarios_avaliacoes_avaliador_idTousuarios?.nome ?? "Usuário",
      data: formatBr(review.criado_em),
      nota: Number(review.nota ?? 0),
      comentario: review.comentario ?? "",
    })),
  };
}

// Traduz registro financeiro interno para o formato usado pelas rotas legadas.
export function serializePayment(p: any): Record<string, unknown> {
  const data = p.dados && typeof p.dados === "object" ? p.dados as Record<string, unknown> : {};
  return { id: p.id, aluguel_id: p.aluguel_id, aluguelId: p.aluguel_id, valor: money(p.valor), metodo: p.metodo, status: p.status, pago_em: p.pago_em, ambiente: p.gateway === "demo" ? "simulado" : p.gateway,
    ...(typeof data.codigo_copia_cola === "string" ? { codigo_copia_cola: data.codigo_copia_cola, qr_code: data.codigo_copia_cola } : {}),
    ...(typeof data.qr_code_base64 === "string" ? { qr_code_base64: data.qr_code_base64 } : {}),
    ...(typeof data.expira_em === "string" ? { expira_em: data.expira_em } : {}),
    ...(paymentAction(data.acao_necessaria) ? { acao_necessaria: paymentAction(data.acao_necessaria) } : {}),
  };
}
// Expõe os campos de avaliação aceitos pelo contrato da API.
export function serializeReview(r: any): Record<string, unknown> {
  return { id: r.id, aluguel_id: r.aluguel_id, avaliador_id: r.avaliador_id, avaliado_id: r.avaliado_id, contexto: r.contexto, objetoId: r.item_id, nota: r.nota, comentario: r.comentario ?? "", criado_em: r.criado_em };
}
// Identifica remetente relativo ao usuário e adapta anexo e leitura para o chat.
export function serializeMessage(m: any, userId: string): Record<string, unknown> {
  const attachment = m.anexo ? { id: m.anexo.id, url: `/api/uploads/${m.anexo.id}`, name: m.anexo.nome, mimeType: m.anexo.mime, type: m.anexo.mime.startsWith("image/") ? "image" : m.anexo.mime.startsWith("video/") ? "video" : "file" } : null;
  return { id: m.id, from: m.remetente_id === userId ? "me" : "them", type: attachment?.type ?? "text", text: m.conteudo, time: m.enviada_em, status: m.lida ? "read" : "sent", attachment };
}

// Oculta CPF, email e telefone em respostas públicas; libera esses campos no perfil próprio.
export function serializeUser(user: any, includePrivate = false): Record<string,unknown> {
 return { id:user.id, nome:user.nome, tipo:user.tipo, avatarUrl:user.foto_url, foto_url:user.foto_url, bio:user.bio ?? "", verificado:user.verificado ?? false, ...(includePrivate ? { email:user.email, cpf:user.cpf, telefone:user.telefone, whatsapp:user.telefone } : {}) };
}

// Traduz estados financeiros e entrega apenas PIX ou ação 3DS válidos ao cliente.
export function serializePublicPayment(p:any) {
 const data=p.dados as Record<string,any>;
 if(p.status==="conciliacao")throw new HttpError(409,"Pagamento exige conciliação","conciliacao_pendente");
 if(p.gateway==="mercado_pago" && p.metodo==="pix" && p.status==="pendente" && (!data?.codigo_copia_cola || !data?.qr_code_base64 || !data?.expira_em))throw new HttpError(409,"Dados do PIX indisponíveis; cobrança em recuperação","pix_incompleto");
 const mapped=({pago:"aprovado",falhou:"recusado",estornado:"cancelado",cancelamento_pendente:"pendente",estorno_pendente:"pendente",pendente:"pendente",cancelado:"cancelado",expirado:"expirado"} as Record<string,string>)[p.status];
 if(!mapped)throw new HttpError(500,"Estado financeiro desconhecido","estado_financeiro_desconhecido");
 const status=isExpiredPix(p)?"expirado":mapped;
 return {pagamento_id:p.id,id:p.id,status,status_interno:p.status,valor_total:Number(p.valor),tipo:p.tipo,ambiente:p.gateway==="demo"?"simulado":p.gateway,
  ...(status==="recusado"?{mensagem:"O pagamento foi recusado pelo emissor."}:{}),
  ...(p.metodo==="pix" && data.codigo_copia_cola?{pix:{copia_e_cola:data.codigo_copia_cola,qr_code_base64:data.qr_code_base64 ?? null,expira_em_segundos:Math.max(0,Math.floor((new Date(data.expira_em).getTime()-Date.now())/1000))}}:{}),
  ...(status==="pendente" && paymentAction(data.acao_necessaria)?{acao_necessaria:paymentAction(data.acao_necessaria)}:{})};
}
