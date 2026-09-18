import fs from "node:fs";
import { readFile, unlink } from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
import multer from "multer";
import type { RequestHandler } from "express";
import { backendRoot } from "../utils/files.ts";
import { HttpError } from "../utils/httpError.ts";
export const privateRoot = path.join(backendRoot, "private-uploads");
fs.mkdirSync(privateRoot, { recursive: true });
const types: Record<string, string> = {
 "image/jpeg": ".jpg", "image/png": ".png", "image/webp": ".webp", "image/gif": ".gif", "application/pdf": ".pdf", "video/mp4": ".mp4", "video/webm": ".webm", "application/msword": ".doc", "application/vnd.openxmlformats-officedocument.wordprocessingml.document": ".docx",
};
function upload(max: number, size: number, imagesOnly = false) {
 return multer({ storage: multer.diskStorage({ destination: privateRoot, filename: (_req, file, cb) => cb(null, crypto.randomUUID() + types[file.mimetype]) }), limits: { fileSize: size * 1024 * 1024, files: max, fields: 30, fieldSize: 10000 }, fileFilter: (_req, file, cb) => {
  if (!types[file.mimetype] || (imagesOnly && !file.mimetype.startsWith("image/"))) cb(new HttpError(422, "Tipo de arquivo não permitido")); else cb(null, true);
 } });
}
export const identityUpload = upload(3, 5, true).fields([{ name: "documentoFrente", maxCount: 1 }, { name: "documentoVerso", maxCount: 1 }, { name: "selfie", maxCount: 1 }]);
export const attachmentUpload = upload(1, 25).single("file");
export { validFileStructure as matchesMime } from "../utils/fileStructure.ts";
import { validFileContent } from "../utils/fileStructure.ts";
export const verifyUploads: RequestHandler = async (req, _res, next) => {
 const files = req.file ? [req.file] : Array.isArray(req.files) ? req.files : Object.values(req.files ?? {}).flat();
 for (const file of files) {
  const bytes = await readFile(file.path);
  if (!await validFileContent(bytes, file.mimetype)) { await Promise.all(files.map(f => unlink(f.path).catch(() => undefined))); throw new HttpError(422, "Conteúdo do arquivo incompatível com MIME type"); }
 }
 next();
};
