import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const backendRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
export const uploadsRoot = path.join(backendRoot, "uploads");

export function publicUploadUrl(filePath: string): string {
  const relative = path.relative(uploadsRoot, filePath).split(path.sep).join("/");
  return `/uploads/${relative}`;
}

export async function removeUploadByUrl(url: string | null | undefined): Promise<void> {
  if (!url?.startsWith("/uploads/")) return;
  const relative = url.slice("/uploads/".length);
  const target = path.resolve(uploadsRoot, relative);
  if (target !== uploadsRoot && !target.startsWith(`${uploadsRoot}${path.sep}`)) return;
  await fs.unlink(target).catch(() => undefined);
}
