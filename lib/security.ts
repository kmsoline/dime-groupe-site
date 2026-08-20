/**
 * Utilitaires de sécurité — Edge + Node.js compatible.
 */

import { NextRequest, NextResponse } from "next/server";

// ===== SANITISATION =====

/**
 * H3 — Nettoyage minimal et non destructif : retire uniquement les null bytes
 * et tronque à maxLen. Ne modifie pas le contenu légitime.
 * React échappe automatiquement les caractères dangereux à l'affichage.
 */
export function sanitizeString(s: unknown, maxLen = 500): string {
  if (typeof s !== "string") {
    if (s === null || s === undefined) return "";
    s = String(s);
  }
  return (s as string)
    .replace(/\0/g, "")   // null bytes uniquement
    .trim()
    .slice(0, maxLen);
}

/**
 * Valide un email (RFC 5321 simplifié, sans ReDoS).
 */
export function isValidEmail(email: string): boolean {
  if (typeof email !== "string") return false;
  if (email.length > 254) return false;
  const re = /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*\.[a-zA-Z]{2,}$/;
  return re.test(email);
}

/**
 * Valide un numéro de téléphone (international ou local).
 */
export function isValidPhone(phone: string): boolean {
  if (typeof phone !== "string") return false;
  if (phone.length > 20) return false;
  const re = /^\+?[\d\s\-().]{7,20}$/;
  return re.test(phone);
}

/**
 * C6 — Valide qu'une URL n'utilise pas de schéma dangereux (javascript:, data:, vbscript:, etc.).
 * Autorise : chemins relatifs (/…), http://, https://, mailto:, tel:.
 * Retourne null si l'URL est invalide/dangereuse.
 */
export function sanitizeUrl(url: unknown): string | null {
  if (typeof url !== "string") return null;
  const trimmed = url.trim();
  if (!trimmed) return "";

  // Chemins relatifs autorisés
  if (trimmed.startsWith("/")) return trimmed;

  // Ancres (#) autorisées
  if (trimmed.startsWith("#")) return trimmed;

  // Schémas autorisés explicitement
  const allowedSchemes = ["https://", "http://", "mailto:", "tel:"];
  if (allowedSchemes.some(s => trimmed.toLowerCase().startsWith(s))) return trimmed;

  // Tout le reste (javascript:, data:, vbscript:, blob:, etc.) est rejeté
  return null;
}

/**
 * Sanitize récursivement un objet — conserve les valeurs, retire les null bytes.
 */
export function sanitizeObject<T>(obj: T): T {
  if (obj === null || obj === undefined) return obj;
  if (typeof obj === "string") return sanitizeString(obj, 10_000) as unknown as T;
  if (Array.isArray(obj)) return obj.map((item) => sanitizeObject(item)) as unknown as T;
  if (typeof obj === "object") {
    const result: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(obj as Record<string, unknown>)) {
      result[key] = sanitizeObject(value);
    }
    return result as T;
  }
  return obj;
}

// ===== BODY PARSING SÉCURISÉ =====

export function checkBodySize(body: string, maxBytes = 50_000): boolean {
  return Buffer.byteLength(body, "utf8") <= maxBytes;
}

export async function parseBody<T>(req: NextRequest, maxBytes = 50_000): Promise<T> {
  const raw = await req.text();
  if (!checkBodySize(raw, maxBytes)) {
    throw NextResponse.json({ error: "Requête trop volumineuse" }, { status: 413 });
  }
  try {
    return JSON.parse(raw) as T;
  } catch {
    throw NextResponse.json({ error: "JSON invalide" }, { status: 400 });
  }
}

// ===== IP EXTRACTION =====

export function getClientIP(req: NextRequest): string {
  // Sur Vercel : x-vercel-proxied-for est injecté par la plateforme et non-spoofable
  const vercel = req.headers.get("x-vercel-proxied-for");
  if (vercel) return vercel.split(",")[0].trim();
  const cf = req.headers.get("cf-connecting-ip");
  if (cf) return cf.split(",")[0].trim();
  const xff = req.headers.get("x-forwarded-for");
  if (xff) return xff.split(",")[0].trim();
  const xri = req.headers.get("x-real-ip");
  if (xri) return xri.trim();
  return "unknown";
}

// ===== HEADERS DE SÉCURITÉ API =====

export function secureApiHeaders(): Record<string, string> {
  return {
    "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate",
    "Pragma": "no-cache",
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "DENY",
    "Referrer-Policy": "no-referrer",
  };
}

// ===== CSV EXPORT SÉCURISÉ =====

/**
 * Protège contre l'injection de formule CSV (Excel/LibreOffice).
 * Les cellules commençant par =, +, -, @, | ou \t sont préfixées par une apostrophe.
 */
export function csvEscapeCell(value: string): string {
  const str = value.replace(/"/g, '""'); // doubler les guillemets internes
  // Neutraliser l'injection de formule
  if (/^[=+\-@|\\t]/.test(str)) return `"'${str}"`;
  return `"${str}"`;
}
