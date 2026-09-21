import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import type { Request } from "express";
import multer from "multer";
import { uploadsRoot } from "../utils/files.ts";
import { privateRoot } from "./privateUpload.ts";
import { HttpError } from "../utils/httpError.ts";

type DestinationCallback = (error: Error | null, destination: string) => void;
type FilenameCallback = (error: Error | null, filename: string) => void;
type FileFilterCallback = (error: Error | null, acceptFile?: boolean) => void;

// Define tipos de imagem aceitos e extensões gravadas no disco.
const allowedImageTypes: Record<string, string> = {
  "image/jpeg": ".jpg",
  "image/png": ".png",
  "image/webp": ".webp",
  "image/gif": ".gif",
};

// Cria upload com nome UUID, limite de tamanho/quantidade e pasta pública ou privada conforme uso.
function uploader(folder: "items" | "avatars" | "withdrawals", maxFiles: number) {
  const destination = path.join(folder === "withdrawals" ? privateRoot : uploadsRoot, folder);
  fs.mkdirSync(destination, { recursive: true });
  return multer({
    storage: multer.diskStorage({
      destination: (_req: Request, _file: Express.Multer.File, callback: DestinationCallback) => callback(null, destination),
      filename: (_req: Request, file: Express.Multer.File, callback: FilenameCallback) => callback(null, `${Date.now()}-${crypto.randomUUID()}${allowedImageTypes[file.mimetype] ?? ".img"}`),
    }),
    limits: { fileSize: 5 * 1024 * 1024, files: maxFiles, fields: 30, fieldSize: 10000 },
    fileFilter: (_req: Request, file: Express.Multer.File, callback: FileFilterCallback) => {
      if (!allowedImageTypes[file.mimetype]) {
        callback(new HttpError(422, "Use imagens JPG, PNG, WEBP ou GIF"));
        return;
      }
      callback(null, true);
    },
  });
}

// Exporta variantes para objetos, avatar e fotos de retirada/devolução.
const items = uploader("items", 5);
export const createItemUpload = items.array("fotos", 5);
export const updateItemUpload = items.fields([{ name: "fotos", maxCount: 5 }, { name: "fotos_novas", maxCount: 5 }]);
export const avatarUpload = uploader("avatars", 1).fields([{ name: "avatar", maxCount: 1 }, { name: "foto", maxCount: 1 }]);
export const withdrawalUpload = uploader("withdrawals", 5).array("fotos", 5);
