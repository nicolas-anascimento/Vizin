import fs from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

// Define caminhos de uploads públicos e fotos privadas de retirada/devolução.
export const backendRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
export const uploadsRoot = path.join(backendRoot, "uploads");
export const privateWithdrawalRoot = path.join(backendRoot, "private-uploads", "withdrawals");

// Converte caminho privado em URL protegida pela rota autenticada.
export function withdrawalPhotoUrl(filePath: string): string {
  return `/uploads/withdrawals/${path.basename(filePath)}`;
}

// Converte o arquivo público salvo em URL devolvida pela API.
export function publicUploadUrl(filePath: string): string {
  const relative = path.relative(uploadsRoot, filePath).split(path.sep).join("/");
  return `/uploads/${relative}`;
}

// Aceita somente URLs web de avatar. Caminhos internos ou de outros tipos de
// upload nunca são propagados pelos DTOs de usuário.
export function avatarUrl(value: unknown): string | null {
  if (typeof value !== "string" || !value) return null;
  if (/^\/uploads\/avatars\/[A-Za-z0-9][A-Za-z0-9._-]*$/.test(value)) {
    return existsSync(path.join(uploadsRoot, "avatars", path.basename(value))) ? value : null;
  }
  if (!/^https?:\/\//i.test(value)) return null;
  try {
    const parsed = new URL(value);
    return parsed.protocol === "http:" || parsed.protocol === "https:" ? value : null;
  } catch {
    return null;
  }
}

// Remove arquivo antigo somente quando sua URL aponta para um upload local permitido.
export async function removeUploadByUrl(url: string | null | undefined): Promise<void> {
  if (!url?.startsWith("/uploads/")) return;
  const relative = url.slice("/uploads/".length);
  const target = path.resolve(uploadsRoot, relative);
  if (target !== uploadsRoot && !target.startsWith(`${uploadsRoot}${path.sep}`)) return;
  await fs.unlink(target).catch(() => undefined);
}
