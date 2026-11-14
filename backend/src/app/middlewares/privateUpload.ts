import fs from "node:fs";
import { open, readFile, unlink } from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import multer from "multer";
import type { RequestHandler } from "express";
import { backendRoot } from "../utils/files.ts";
import { HttpError } from "../utils/httpError.ts";
import env from "../config/env.ts";
import { uploadMetadataSchema } from "../schemas/uploads.schema.ts";
// Documentos de identidade e anexos ficam fora do diretório servido publicamente.
export const privateRoot = path.join(backendRoot, "private-uploads");
fs.mkdirSync(privateRoot, { recursive: true });
const types: Record<string, string> = {
 "image/jpeg": ".jpg", "image/png": ".png", "image/webp": ".webp", "image/gif": ".gif", "application/pdf": ".pdf", "video/mp4": ".mp4", "video/webm": ".webm", "video/quicktime": ".mov", "application/msword": ".doc", "application/vnd.openxmlformats-officedocument.wordprocessingml.document": ".docx",
};
const allowedExtensions: Record<string, string[]> = {
 "image/jpeg": [".jpg", ".jpeg"], "image/png": [".png"], "image/webp": [".webp"], "image/gif": [".gif"],
 "application/pdf": [".pdf"], "video/mp4": [".mp4"], "video/webm": [".webm"], "video/quicktime": [".mov"],
 "application/msword": [".doc"], "application/vnd.openxmlformats-officedocument.wordprocessingml.document": [".docx"],
};
// Restringe MIME, tamanho e quantidade antes de gravar arquivos privados com UUID.
function upload(max: number, size: number, imagesOnly = false, checkExtension = false) {
 return multer({ storage: multer.diskStorage({ destination: privateRoot, filename: (_req, file, cb) => cb(null, crypto.randomUUID() + types[file.mimetype]) }), limits: { fileSize: size * 1024 * 1024, files: max, fields: 30, fieldSize: 10000 }, fileFilter: (_req, file, cb) => {
  if (!types[file.mimetype] || (imagesOnly && (!file.mimetype.startsWith("image/") || file.mimetype === "image/gif"))) {
   cb(checkExtension
    ? new HttpError(415, "Este formato de arquivo não é permitido.", "tipo_nao_permitido")
    : new HttpError(422, "Tipo de arquivo não permitido")); return;
  }
  const originalName = file.originalname.replace(/\\/g, "/").split("/").pop() || "";
  if (checkExtension && !allowedExtensions[file.mimetype]?.includes(path.extname(originalName).toLowerCase())) {
   cb(new HttpError(415, "Extensão e tipo do arquivo não correspondem.", "tipo_nao_permitido")); return;
  }
  cb(null, true);
 } });
}
export const identityUpload = upload(3, 5, true).fields([{ name: "documentoFrente", maxCount: 1 }, { name: "documentoVerso", maxCount: 1 }, { name: "selfie", maxCount: 1 }]);
export const attachmentUpload = upload(1, env.CHAT_ATTACHMENT_MAX_MB, false, true).single("file");
export { validFileStructure as matchesMime } from "../utils/fileStructure.ts";
import { validFileContent } from "../utils/fileStructure.ts";
// Confere a estrutura real de cada arquivo, além do MIME declarado, e remove arquivos rejeitados.
export const verifyUploads: RequestHandler = async (req, _res, next) => {
 const files = req.file ? [req.file] : Array.isArray(req.files) ? req.files : Object.values(req.files ?? {}).flat();
 for (const file of files) {
  if (!uploadMetadataSchema.safeParse(file).success) throw new HttpError(422, "Arquivo inválido", "arquivo_invalido");
  const bytes = await readFile(file.path);
  if (!await validFileContent(bytes, file.mimetype)) { await Promise.all(files.map(f => unlink(f.path).catch(() => undefined))); throw new HttpError(422, "Conteúdo do arquivo incompatível com MIME type"); }
 }
 next();
};

const runProbe = promisify(execFile);
async function videoContainerMatches(filePath: string, mime: string): Promise<boolean> {
 const handle = await open(filePath, "r");
 const header = Buffer.alloc(4096);
 let bytesRead = 0;
 try { ({ bytesRead } = await handle.read(header, 0, header.length, 0)); }
 finally { await handle.close(); }
 const bytes = header.subarray(0, bytesRead);
 if (mime === "video/webm") {
  if (bytes.length < 20 || bytes.readUInt32BE(0) !== 0x1a45dfa3) return false;
  const docType = bytes.indexOf(Buffer.from([0x42, 0x82]));
  return docType >= 0 && bytes[docType + 2] === 0x84 && bytes.toString("ascii", docType + 3, docType + 7) === "webm";
 }
 if (bytes.length < 12) return false;
 const atom = bytes.toString("ascii", 4, 8);
 if (mime === "video/quicktime" && atom === "moov") return true;
 if (atom !== "ftyp") return false;
 const brand = bytes.toString("ascii", 8, 12);
 return mime === "video/quicktime" ? brand === "qt  " : brand !== "qt  " && /^[\x20-\x7e]{4}$/.test(brand);
}
async function validVideo(filePath: string, mime: string): Promise<boolean> {
 try {
  if (!await videoContainerMatches(filePath, mime)) return false;
  const { stdout } = await runProbe("ffprobe", ["-v", "error", "-show_entries", "format=format_name:stream=codec_type,codec_name", "-of", "json", filePath], { timeout: 20000, maxBuffer: 1024 * 1024 });
  const data = JSON.parse(stdout) as { format?: { format_name?: string }; streams?: { codec_type?: string; codec_name?: string }[] };
  const formats = data.format?.format_name?.split(",") ?? [];
  const expected = mime === "video/webm" ? "matroska" : "mov";
  return formats.includes(expected) && (data.streams ?? []).some(stream => stream.codec_type === "video" && stream.codec_name && stream.codec_name !== "unknown");
 } catch (error) {
  if (typeof error === "object" && error !== null && "code" in error && error.code === "ENOENT") {
   throw new HttpError(503, "Validação de vídeo indisponível.", "validador_indisponivel");
  }
  return false;
 }
}

// Vídeos são validados no disco pelo ffprobe, sem carregar até 50 MB no heap Node.
export const verifyChatAttachment: RequestHandler = async (req, _res, next) => {
 const file = req.file;
 if (!file || file.size === 0) throw new HttpError(422, "Não foi possível validar o arquivo enviado.", "arquivo_invalido");
 if (!uploadMetadataSchema.safeParse(file).success) throw new HttpError(422, "Não foi possível validar o arquivo enviado.", "arquivo_invalido");
 const valid = file.mimetype.startsWith("video/")
  ? await validVideo(file.path, file.mimetype)
  : await validFileContent(await readFile(file.path), file.mimetype);
 if (!valid) throw new HttpError(422, "Não foi possível validar o arquivo enviado.", "arquivo_invalido");
 next();
};
