/**
 * Proxy Next.js 16 — Edge Runtime (anciennement middleware.ts)
 *
 * Responsabilités :
 *  1. Protection des routes /api/admin/* (vérification cookie JWT)
 *  2. Rate limiting sur /api/admin/* (60 req/min par IP)
 *  3. Rate limiting sur /api/contact et /api/newsletter (5 req/15min par IP)
 *  4. Vérification CSRF Origin sur les routes admin non-GET (C7)
 *  5. Ajout de X-Request-ID sur toutes les réponses /api/*
 *
 * NOTE : Ce fichier n'importe aucun module Node.js — Edge Runtime uniquement.
 */

import { NextRequest, NextResponse } from "next/server";

// ===== JWT EDGE (SubtleCrypto) =====

// C2 — Fail closed : si JWT_SECRET est absent/court, refuser toutes les routes admin.
function getJwtSecret(): string | null {
  const s = process.env.JWT_SECRET;
  return (s && s.length >= 32) ? s : null;
}

function base64urlDecode(s: string): Uint8Array {
  const b64 = s.replace(/-/g, "+").replace(/_/g, "/");
  const padded = b64 + "=".repeat((4 - (b64.length % 4)) % 4);
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

async function verifyJWTEdge(token: string): Promise<boolean> {
  try {
    const secret = getJwtSecret();
    if (!secret) return false; // C2 — secret absent → refus

    const parts = token.split(".");
    if (parts.length !== 3) return false;
    const [header, body, signature] = parts;

    // Vérifier que alg === "HS256" — protection contre alg:none
    let hdr: Record<string, string>;
    try { hdr = JSON.parse(new TextDecoder().decode(base64urlDecode(header))); } catch { return false; }
    if (hdr.alg !== "HS256") return false;

    const keyData = new TextEncoder().encode(secret);
    const key = await crypto.subtle.importKey("raw", keyData, { name: "HMAC", hash: "SHA-256" }, false, ["verify"]);

    const message = new TextEncoder().encode(`${header}.${body}`);
    const sigBytes = base64urlDecode(signature);
    const valid = await crypto.subtle.verify("HMAC", key, sigBytes.buffer as ArrayBuffer, message);
    if (!valid) return false;

    const payload = JSON.parse(new TextDecoder().decode(base64urlDecode(body)));
    if (!payload.exp || payload.exp < Math.floor(Date.now() / 1000)) return false;
    return true;
  } catch {
    return false;
  }
}

// ===== RATE LIMITER EDGE =====

interface EdgeEntry { count: number; windowStart: number; }
const adminStore = new Map<string, EdgeEntry>();
const publicStore = new Map<string, EdgeEntry>();

function edgeRateLimit(
  store: Map<string, EdgeEntry>,
  key: string,
  maxReqs: number,
  windowMs: number
): { allowed: boolean; retryAfter?: number } {
  const now = Date.now();
  const entry = store.get(key);
  if (!entry || now - entry.windowStart >= windowMs) {
    store.set(key, { count: 1, windowStart: now });
    return { allowed: true };
  }
  entry.count += 1;
  if (entry.count > maxReqs) {
    const retryAfter = Math.ceil((entry.windowStart + windowMs - now) / 1000);
    return { allowed: false, retryAfter };
  }
  return { allowed: true };
}

let _callCount = 0;
function maybeClean(store: Map<string, EdgeEntry>, windowMs: number) {
  _callCount++;
  if (_callCount % 200 !== 0) return;
  const now = Date.now();
  for (const [k, v] of store.entries()) {
    if (now - v.windowStart > windowMs * 2) store.delete(k);
  }
}

// ===== IP =====

function getIP(req: NextRequest): string {
  // Sur Vercel : x-vercel-proxied-for est injecté par la plateforme et non-spoofable
  const vercel = req.headers.get("x-vercel-proxied-for");
  if (vercel) return vercel.split(",")[0].trim();
  // Cloudflare
  const cf = req.headers.get("cf-connecting-ip");
  if (cf) return cf.split(",")[0].trim();
  // Proxy standard
  const xff = req.headers.get("x-forwarded-for");
  if (xff) return xff.split(",")[0].trim();
  return "unknown";
}

// ===== ALLOWED ORIGINS (C7 — CSRF) =====

function isAllowedOrigin(origin: string | null): boolean {
  if (!origin) return true; // Requêtes sans Origin (curl, serveur-à-serveur) autorisées
  const allowed = [
    process.env.NEXT_PUBLIC_SITE_URL,
    "http://localhost:3000",
    "http://localhost:3001",
  ].filter(Boolean);
  return allowed.some(o => origin === o || origin.startsWith(o as string));
}

// ===== UUID court =====

function shortId(): string {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
}

// ===== MIDDLEWARE =====

export async function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const ip = getIP(req);

  if (!pathname.startsWith("/api/")) {
    return NextResponse.next();
  }

  const requestId = shortId();

  // ── Protection routes admin ──────────────────────────────────────────────
  if (pathname.startsWith("/api/admin/")) {
    maybeClean(adminStore, 60_000);

    const rl = edgeRateLimit(adminStore, `admin:${ip}`, 60, 60_000);
    if (!rl.allowed) {
      return NextResponse.json(
        { error: "Trop de requêtes — réessayez plus tard" },
        { status: 429, headers: { "Retry-After": String(rl.retryAfter ?? 60), "X-Request-ID": requestId } }
      );
    }

    // C7 — Vérification CSRF : les requêtes non-GET/HEAD/OPTIONS sur /api/admin/*
    // doivent provenir du même domaine.
    const method = req.method.toUpperCase();
    if (!["GET", "HEAD", "OPTIONS"].includes(method)) {
      const origin = req.headers.get("origin");
      if (!isAllowedOrigin(origin)) {
        return NextResponse.json(
          { error: "Origine non autorisée" },
          { status: 403, headers: { "X-Request-ID": requestId } }
        );
      }
    }

    // Routes publiques (pas de JWT requis)
    const isPublicAdminRoute =
      pathname === "/api/admin/login" ||
      pathname === "/api/admin/check-auth";

    if (!isPublicAdminRoute) {
      const cookie = req.cookies.get("admin_token");
      const token = cookie?.value ?? null;
      const valid = token ? await verifyJWTEdge(token) : false;

      if (!valid) {
        return NextResponse.json(
          { error: "Non autorisé" },
          { status: 401, headers: { "X-Request-ID": requestId, "Cache-Control": "no-store" } }
        );
      }
    }
  }

  // ── Rate limiting routes publiques sensibles ─────────────────────────────
  if (pathname === "/api/contact" || pathname === "/api/newsletter") {
    maybeClean(publicStore, 15 * 60_000);
    const maxReqs = pathname === "/api/newsletter" ? 3 : 5;
    const rl = edgeRateLimit(publicStore, `pub:${ip}:${pathname}`, maxReqs, 15 * 60_000);
    if (!rl.allowed) {
      return NextResponse.json(
        { error: "Trop de requêtes — réessayez dans quelques minutes" },
        { status: 429, headers: { "Retry-After": String(rl.retryAfter ?? 900), "X-Request-ID": requestId } }
      );
    }
  }

  const response = NextResponse.next();
  response.headers.set("X-Request-ID", requestId);
  return response;
}

export const config = {
  matcher: ["/api/:path*"],
};
