/**
 * Authentification sécurisée — Neon / Next.js App Router.
 * - Hachage de mot de passe : crypto.scryptSync (équivalent bcrypt)
 * - JWT : HMAC-SHA256 signé (compatible Edge runtime)
 */

import crypto from "crypto";

// C2 — Fail closed : ne jamais utiliser un secret par défaut.
function requireJwtSecret(): string {
  const secret = process.env.JWT_SECRET;
  if (!secret || secret.length < 32) {
    throw new Error(
      "❌ JWT_SECRET manquant ou trop court (minimum 32 caractères).\n" +
      "   Définissez JWT_SECRET dans vos variables d'environnement."
    );
  }
  return secret;
}

const JWT_EXPIRES_IN = 7 * 24 * 60 * 60; // 7 jours

// ===== HACHAGE =====

export async function hashPassword(password: string): Promise<string> {
  const input = password.slice(0, 128);
  const salt = crypto.randomBytes(16).toString("hex");
  const hash = await new Promise<Buffer>((resolve, reject) =>
    crypto.scrypt(input, salt, 64, (err, derived) => (err ? reject(err) : resolve(derived)))
  );
  return `${salt}:${hash.toString("hex")}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  try {
    const [salt, hash] = stored.split(":");
    if (!salt || !hash) return false;
    const input = password.slice(0, 128);
    const derived = await new Promise<Buffer>((resolve, reject) =>
      crypto.scrypt(input, salt, 64, (err, key) => (err ? reject(err) : resolve(key)))
    );
    const storedBuf = Buffer.from(hash, "hex");
    // C3 — timingSafeEqual exige des buffers de même longueur.
    if (derived.length !== storedBuf.length) return false;
    return crypto.timingSafeEqual(derived, storedBuf);
  } catch {
    return false;
  }
}

// ===== JWT =====

interface JWTPayload {
  sub: string;
  email: string;
  role: string;
  iat: number;
  exp: number;
}

function base64url(data: string): string {
  return Buffer.from(data).toString("base64url");
}

function base64urlDecode(data: string): string {
  return Buffer.from(data, "base64url").toString("utf8");
}

export function createJWT(payload: Omit<JWTPayload, "iat" | "exp">): string {
  const secret = requireJwtSecret();
  const header = base64url(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const now = Math.floor(Date.now() / 1000);
  const body = base64url(JSON.stringify({ ...payload, iat: now, exp: now + JWT_EXPIRES_IN }));
  const signature = crypto.createHmac("sha256", secret).update(`${header}.${body}`).digest("base64url");
  return `${header}.${body}.${signature}`;
}

export function verifyJWT(token: string): JWTPayload | null {
  try {
    const parts = token.split(".");
    if (parts.length !== 3) return null;
    const [header, body, signature] = parts;

    // Vérifier que alg === "HS256" — protection contre alg:none
    let hdr: Record<string, string>;
    try { hdr = JSON.parse(base64urlDecode(header)); } catch { return null; }
    if (hdr.alg !== "HS256") return null;

    const secret = requireJwtSecret();
    const expected = crypto.createHmac("sha256", secret).update(`${header}.${body}`).digest("base64url");

    // C3 — Buffers UTF-8 de même longueur garantie avant timingSafeEqual
    const eBuf = Buffer.from(expected, "utf8");
    const sBuf = Buffer.from(signature, "utf8");
    if (eBuf.length !== sBuf.length) return null;
    if (!crypto.timingSafeEqual(eBuf, sBuf)) return null;

    const payload: JWTPayload = JSON.parse(base64urlDecode(body));
    if (payload.exp < Math.floor(Date.now() / 1000)) return null;
    return payload;
  } catch {
    return null;
  }
}

// ===== COOKIE =====

export function getAuthCookieOptions(maxAge = JWT_EXPIRES_IN) {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict" as const,
    maxAge,
    path: "/",
  };
}
