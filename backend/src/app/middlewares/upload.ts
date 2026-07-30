import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import type { Request } from "express";
import multer from "multer";
import { uploadsRoot } from "../utils/files.ts";
import { HttpError } from "../utils/httpError.ts";

type DestinationCallback = (error: Error | null, destination: string) => void;
type FilenameCallback = (error: Error | null, filename: string) => void;
type FileFilterCallback = (error: Error | null, acceptFile?: boolean) => void;

const allowedImageTypes: Record<string, string> = {
  "image/jpeg": ".jpg",
  "image/png": ".png",
  "image/webp": ".webp",
  "image/gif": ".gif",
};

function uploader(folder: "items" | "avatars" | "withdrawals", maxFiles: number) {
  const destination = path.join(uploadsRoot, folder);
  fs.mkdirSync(destination, { recursive: true });
  return multer({
    storage: multer.diskStorage({
      destination: (_req: Request, _file: Express.Multer.File, callback: DestinationCallback) => callback(null, destination),
      filename: (_req: Request, file: Express.Multer.File, callback: FilenameCallback) => callback(null, `${Date.now()}-${crypto.randomUUID()}${allowedImageTypes[file.mimetype] ?? ".img"}`),
    }),
    limits: { fileSize: 5 * 1024 * 1024, files: maxFiles },
    fileFilter: (_req: Request, file: Express.Multer.File, callback: FileFilterCallback) => {
      if (!allowedImageTypes[file.mimetype]) {
        callback(new HttpError(422, "Use imagens JPG, PNG, WEBP ou GIF"));
        return;
      }
      callback(null, true);
    },
  });
}

const items = uploader("items", 5);
export const createItemUpload = items.array("fotos", 5);
export const updateItemUpload = items.fields([{ name: "fotos", maxCount: 5 }, { name: "fotos_novas", maxCount: 5 }]);
export const avatarUpload = uploader("avatars", 1).fields([{ name: "avatar", maxCount: 1 }, { name: "foto", maxCount: 1 }]);
export const withdrawalUpload = uploader("withdrawals", 5).array("fotos", 5);
