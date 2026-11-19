import "dotenv/config";
export const origin = new URL(process.env.APP_URL || "http://localhost:5173").origin;
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
