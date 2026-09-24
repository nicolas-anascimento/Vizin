import { rateLimit } from "./rateLimit.ts";

// Consultas não consomem o bucket; mutações são limitadas pelo UUID do admin.
export const adminWriteLimit = rateLimit({
  windowMs: 60_000,
  max: 60,
  scope: "admin-write",
  code: "rate_limit_admin",
  message: "Muitas alterações administrativas",
  skip: (req) => ["GET", "HEAD", "OPTIONS"].includes(req.method),
});
