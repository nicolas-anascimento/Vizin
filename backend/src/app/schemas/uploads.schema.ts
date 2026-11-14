import { z } from "zod";

export const uploadMetadataSchema = z.object({
  originalname: z.string().min(1),
  mimetype: z.string().min(1),
  size: z.int().positive(),
});
export type UploadMetadata = z.output<typeof uploadMetadataSchema>;
