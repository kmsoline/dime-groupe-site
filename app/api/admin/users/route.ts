import { NextRequest, NextResponse } from "next/server";
import { checkAdminAuth, checkAdminRole, getAdminUser } from "@/lib/api-auth";
import { dbSelect, dbInsert, dbUpdate } from "@/lib/db";
import { hashPassword } from "@/lib/auth";
import { sanitizeString, isValidEmail } from "@/lib/security";

// Rôles valides
const VALID_ROLES = new Set(["admin", "editor", "viewer"]);

export async function GET(request: NextRequest) {
  // Vérification auth (lecture réservée aux admins connectés)
  if (!(await checkAdminAuth())) {
    return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  }

  // Seul un admin peut lister les utilisateurs
  if (!(await checkAdminRole())) {
    return NextResponse.json({ error: "Accès refusé" }, { status: 403 });
  }

  const users = await dbSelect<{
    id: string;
    email: string;
    name: string;
    role: string;
    active: boolean;
    last_login: string;
    created_at: string;
    // password_hash intentionnellement absent de la sélection
  }>(
    "admin_users",
    "select=id,email,name,role,active,last_login,created_at&active=eq.true"
  );

  return NextResponse.json(users);
}

export async function POST(request: NextRequest) {
  // Vérification auth + rôle admin obligatoire pour créer un utilisateur
  if (!(await checkAdminAuth())) {
    return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  }
  if (!(await checkAdminRole())) {
    return NextResponse.json({ error: "Accès refusé" }, { status: 403 });
  }

  // Lecture sécurisée du body
  const rawText = await request.text();
  if (Buffer.byteLength(rawText, "utf8") > 10_000) {
    return NextResponse.json({ error: "Requête trop volumineuse" }, { status: 413 });
  }

  let data: Record<string, unknown>;
  try {
    data = JSON.parse(rawText);
  } catch {
    return NextResponse.json({ error: "JSON invalide" }, { status: 400 });
  }

  // Validation et sanitisation
  const email = sanitizeString(data.email, 254);
  const password = typeof data.password === "string" ? data.password : "";
  const name = sanitizeString(data.name, 100) || "Utilisateur";
  const role = sanitizeString(data.role, 20);

  if (!email || !isValidEmail(email)) {
    return NextResponse.json({ error: "Email invalide" }, { status: 400 });
  }
  if (!password || password.length < 8) {
    return NextResponse.json({ error: "Mot de passe trop court (min 8 caractères)" }, { status: 400 });
  }
  if (role && !VALID_ROLES.has(role)) {
    return NextResponse.json({ error: "Rôle invalide" }, { status: 400 });
  }

  const user = await dbInsert("admin_users", {
    email,
    password_hash: hashPassword(password),
    name,
    role: role || "editor",
    active: true,
  });

  // Ne jamais retourner le password_hash
  const { password_hash, ...safeUser } = user as Record<string, unknown>;
  void password_hash; // supprimer l'avertissement TS unused variable
  return NextResponse.json(safeUser, { status: 201 });
}

export async function PATCH(request: NextRequest) {
  // Modification réservée aux admins
  if (!(await checkAdminAuth())) {
    return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  }
  if (!(await checkAdminRole())) {
    return NextResponse.json({ error: "Accès refusé" }, { status: 403 });
  }

  const rawText = await request.text();
  if (Buffer.byteLength(rawText, "utf8") > 10_000) {
    return NextResponse.json({ error: "Requête trop volumineuse" }, { status: 413 });
  }

  let data: Record<string, unknown>;
  try {
    data = JSON.parse(rawText);
  } catch {
    return NextResponse.json({ error: "JSON invalide" }, { status: 400 });
  }

  const id = sanitizeString(data.id, 100);
  if (!id) {
    return NextResponse.json({ error: "ID utilisateur requis" }, { status: 400 });
  }

  // Empêcher un admin de modifier son propre rôle (protection)
  const currentUser = await getAdminUser();
  if (currentUser?.sub === id && data.role !== undefined) {
    return NextResponse.json({ error: "Vous ne pouvez pas modifier votre propre rôle" }, { status: 403 });
  }

  const updates: Record<string, unknown> = {};

  if (data.name !== undefined) {
    updates.name = sanitizeString(data.name, 100);
  }
  if (data.email !== undefined) {
    const email = sanitizeString(data.email, 254);
    if (!isValidEmail(email)) {
      return NextResponse.json({ error: "Email invalide" }, { status: 400 });
    }
    updates.email = email;
  }
  if (data.role !== undefined) {
    const role = sanitizeString(data.role, 20);
    if (!VALID_ROLES.has(role)) {
      return NextResponse.json({ error: "Rôle invalide" }, { status: 400 });
    }
    updates.role = role;
  }
  if (data.active !== undefined) {
    updates.active = Boolean(data.active);
  }
  if (data.password !== undefined) {
    const pw = typeof data.password === "string" ? data.password : "";
    if (pw.length < 8) {
      return NextResponse.json({ error: "Mot de passe trop court (min 8 caractères)" }, { status: 400 });
    }
    updates.password_hash = hashPassword(pw);
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: "Aucune mise à jour fournie" }, { status: 400 });
  }

  const updated = await dbUpdate("admin_users", `id=eq.${encodeURIComponent(id)}`, updates);

  // Ne jamais retourner le password_hash
  const { password_hash: _ph, ...safeUser } = updated as Record<string, unknown>;
  void _ph;
  return NextResponse.json(safeUser);
}
