import "dotenv/config";
export const origin = new URL(process.env.APP_URL || "http://localhost:5173").origin;
export const origins = [
  origin,
  ...(process.env.NODE_ENV === "production" ? [] : ["http://127.0.0.1:5173"]),
  ...(process.env.ALLOWED_ORIGINS || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .map((value) => new URL(value).origin),
];
// Render terminates TLS at its reverse proxy. Trust only the nearest hop;
// never trust arbitrary client-supplied forwarding chains.
export const trustProxy = process.env.RENDER === "true" ? 1 : false;
export const cookieOptions = {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "lax" as const,
  path: "/api",
  maxAge: 8 * 60 * 60 * 1000,
};
