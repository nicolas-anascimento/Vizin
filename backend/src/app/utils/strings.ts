// Normaliza texto opcional e diferencia valor ausente de conteúdo informado.
export function nonEmptyString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim();
  return normalized.length > 0 ? normalized : null;
}

// Interpreta opções booleanas aceitas nos formulários.
export function asBoolean(value: unknown, fallback = false): boolean {
  if (typeof value === "boolean") return value;
  if (typeof value === "string") return value === "true" || value === "1" || value === "on";
  return fallback;
}

// Valida valores positivos recebidos como texto ou número.
export function asPositiveNumber(value: unknown): number | null {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : null;
}

// Deriva iniciais para apresentação de usuários sem imagem.
export function initials(name: string): string {
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
}
