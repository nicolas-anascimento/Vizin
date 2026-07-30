import { formatBr, rentalDays } from "./dates.ts";
import { initials } from "./strings.ts";

type DecimalLike = { toString(): string } | number | string;
const money = (value: DecimalLike | null | undefined): number => Number(value ?? 0);

export function serializeItem(item: any): Record<string, unknown> {
  const photos = Array.isArray(item.fotos_item)
    ? [...item.fotos_item].sort((a, b) => Number(Boolean(b.principal)) - Number(Boolean(a.principal)))
    : [];
  const owner = item.usuarios;
  const ratingRows = owner?.avaliacoes_avaliacoes_avaliado_idTousuarios ?? [];
  const rating = ratingRows.length
    ? ratingRows.reduce((sum: number, row: any) => sum + Number(row.nota ?? 0), 0) / ratingRows.length
    : 0;
  const category = item.categorias?.nome ?? "Sem categoria";
  const image = photos[0]?.url ?? "/assets/img/sem-imagem.png";
  const location = item.localizacao_texto ?? item.enderecos?.cidade ?? "Não informado";
  return {
    id: item.id,
    nome: item.titulo,
    titulo: item.titulo,
    descricao: item.descricao ?? "",
    categoria: category,
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
    media: Number(rating.toFixed(1)),
    proprietario: owner
      ? {
          id: owner.id,
          nome: owner.nome,
          iniciais: initials(owner.nome),
          avatarUrl: owner.foto_url,
          avaliacao: Number(rating.toFixed(1)),
        }
      : undefined,
  };
}

export function serializeNotification(notification: any): Record<string, unknown> {
  return {
    id: notification.id,
    tipo: notification.tipo ?? "geral",
    titulo: notification.titulo ?? "Notificação",
    descricao: notification.mensagem ?? "",
    mensagem: notification.mensagem ?? "",
    data: notification.criado_em?.toISOString?.() ?? notification.criado_em,
    lida: notification.lida ?? false,
  };
}

export function serializeRental(rental: any): Record<string, unknown> {
  return {
    id: rental.id,
    status: rental.status,
    total: money(rental.valor_total),
    retirada: rental.data_inicio?.toISOString?.().slice(0, 10),
    devolucao: rental.data_fim?.toISOString?.().slice(0, 10),
    dias: rentalDays(rental.data_inicio, rental.data_fim),
    objeto: rental.itens ? serializeItem(rental.itens) : undefined,
    locador: rental.usuarios_alugueis_locador_idTousuarios,
    locatario: rental.usuarios_alugueis_locatario_idTousuarios,
    pagamentos: rental.pagamentos,
  };
}

export function serializeProfile(user: any): Record<string, unknown> {
  const reviews = user.avaliacoes_avaliacoes_avaliado_idTousuarios ?? [];
  const average = reviews.length
    ? reviews.reduce((sum: number, review: any) => sum + Number(review.nota ?? 0), 0) / reviews.length
    : 0;
  const completedRentals = (user.alugueis_alugueis_locatario_idTousuarios ?? []).filter(
    (rental: any) => ["finalizado", "devolvido"].includes(rental.status ?? ""),
  ).length;
  return {
    id: user.id,
    nome: user.nome,
    email: user.email,
    telefone: user.telefone,
    bio: user.bio ?? "",
    avatarUrl: user.foto_url,
    avaliacaoMedia: Number(average.toFixed(1)),
    avaliacaoTotal: reviews.length,
    membroDesde: formatBr(user.criado_em),
    verificado: user.verificado ?? false,
    ativo: user.ativo,
    stats: {
      alugados: completedRentals,
      anunciados: user._count?.itens ?? user.itens?.length ?? 0,
      taxaResposta: 100,
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
