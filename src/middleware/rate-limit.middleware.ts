import { rateLimit } from "express-rate-limit";
export const apiLimit = rateLimit({
  windowMs: 60000,
  limit: 600,
  standardHeaders: true,
  legacyHeaders: false,
});
export const authLimit = rateLimit({
  windowMs: 15 * 60000,
  limit: 25,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many attempts. Try again in 15 minutes." },
});
