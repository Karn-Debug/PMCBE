import "dotenv/config";
export const origin = process.env.APP_URL || "http://localhost:5173";
export const origins = [
  origin,
  ...(process.env.NODE_ENV === "production" ? [] : ["http://127.0.0.1:5173"]),
  ...(process.env.ALLOWED_ORIGINS || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean),
];
export const cookieOptions = {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "lax" as const,
  path: "/api",
  maxAge: 8 * 60 * 60 * 1000,
};
