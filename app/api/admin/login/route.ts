import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { dbSelectOne, dbUpdate } from "@/lib/db";
import { verifyPassword, createJWT, getAuthCookieOptions } from "@/lib/auth";
import { checkRateLimit, resetRateLimit } from "@/lib/rate-limit";
import { getClientIP } from "@/lib/security";

interface AdminUser {
  id: string;
  email: string;
  password_hash: string;
  name: string;
  role: string;
  active: boolean;
}

/** Sanitize basique — retire les caractères dangereux. */
function sanitize(s: string): string {
  return s.trim().slice(0, 254).replace(/[<>'"`;\\]/g, "");
}

export async function POST(request: NextRequest) {
  const ip = getClientIP(request);
  const rateLimitKey = `login:${ip}`;

  // ── Rate limiting : 5 tentatives / 15 min ────────────────────────────────
  const rl = await checkRateLimit(rateLimitKey, 5, 15 * 60 * 1000, 30 * 60 * 1000);
  if (!rl.allowed) {
    const minutes = Math.ceil((rl.retryAfter ?? 1800) / 60);
    return NextResponse.json(
      { error: `Trop de tentatives. Réessayez dans ${minutes} minutes.` },
      {
        status: 429,
        headers: {
          "Retry-After": String(rl.retryAfter ?? 1800),
          "X-RateLimit-Remaining": "0",
        },
      }
    );
  }

  try {
    const body = await request.json();
    if (!body || typeof body !== "object") {
      return NextResponse.json({ error: "Requête invalide" }, { status: 400 });
    }

    const email    = sanitize(String(body.email    ?? ""));
    const password = String(body.password ?? "").slice(0, 128);

    if (!email || !password) {
      return NextResponse.json({ error: "Email et mot de passe requis" }, { status: 400 });
    }

    // Validation basique de l'email
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return NextResponse.json({ error: "Format d'email invalide" }, { status: 400 });
    }

    let userId = "admin";
    let userName = "Admin";
    let userRole = "admin";
    let authenticated = false;

    // ── 1. Base de données Neon ───────────────────────────────────────────────
    try {
      const user = await dbSelectOne<AdminUser>(
        "admin_users",
        `select=id,email,password_hash,name,role,active&email=eq.${encodeURIComponent(email)}&active=eq.true`
      );
      if (user && await verifyPassword(password, user.password_hash)) {
        authenticated = true;
        userId = user.id;
        userName = user.name;
        userRole = user.role;
        dbUpdate("admin_users", `id=eq.${user.id}`, {
          last_login: new Date().toISOString(),
        }).catch(() => {});
      }
    } catch {
      // DB indisponible — fallback env-var
    }

    // ── 2. Fallback variables d'environnement (comparaison temps-constant) ───
    if (!authenticated) {
      const envEmail    = process.env.ADMIN_EMAIL;
      const envPassword = process.env.ADMIN_PASSWORD;
      if (envEmail && envPassword && email === envEmail.toLowerCase()) {
        if (!process.env.JWT_SECRET) {
          return NextResponse.json({ error: "Configuration error" }, { status: 500 });
        }
        const jwtSecret = process.env.JWT_SECRET;
        const hmacInput  = crypto.createHmac("sha256", jwtSecret).update(password).digest();
        const hmacStored = crypto.createHmac("sha256", jwtSecret).update(envPassword).digest();
        if (crypto.timingSafeEqual(hmacInput, hmacStored)) {
          authenticated = true;
        }
      }
    }

    if (!authenticated) {
      // Délai artificiel pour ralentir les attaques par énumération
      await new Promise((r) => setTimeout(r, 500 + Math.random() * 500));
      return NextResponse.json(
        { error: "Identifiants incorrects" },
        {
          status: 401,
          headers: { "X-RateLimit-Remaining": String(rl.remaining - 1) },
        }
      );
    }

    // Succès → réinitialiser le compteur d'échecs
    await resetRateLimit(rateLimitKey);

    const token = createJWT({ sub: userId, email, role: userRole });

    const response = NextResponse.json({
      success: true,
      user: { id: userId, email, name: userName, role: userRole },
    });

    response.cookies.set("admin_token", token, getAuthCookieOptions());
    // Supprimer l'ancien cookie legacy s'il existe encore
    response.cookies.delete("admin_session");

    return response;
  } catch (error) {
    console.error("[Login]", error);
    return NextResponse.json({ error: "Une erreur est survenue" }, { status: 500 });
  }
}
