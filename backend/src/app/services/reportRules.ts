// Ocorrências abertas automaticamente pela manutenção não representam uma
// denúncia feita por um usuário e, por isso, não entram nas métricas de denúncias.
export const SYSTEM_OCCURRENCE_REASONS = ["retirada_evidencia_unilateral"] as const;

export function userReportWhere(extra: Record<string, unknown> = {}) {
  return {
    ...extra,
    motivo: { notIn: [...SYSTEM_OCCURRENCE_REASONS] },
  };
}
