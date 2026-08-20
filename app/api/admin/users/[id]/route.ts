import { NextRequest, NextResponse } from "next/server";
import { checkAdminAuth, checkAdminRole, getAdminUser } from "@/lib/api-auth";
import { dbSelectOne, dbUpdate } from "@/lib/db";
import { hashPassword } from "@/lib/auth";
import { sanitizeString, isValidEmail } from "@/lib/security";

const VALID_ROLES = new Set(["admin", "editor", "viewer"]);

interface AdminUser {
  id: string;
  email: string;
  name: string;
  role: string;
  active: boolean;
  last_login: string | null;
  created_at: string;
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!(await checkAdminAuth())) {
    return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  }
  if (!(await checkAdminRole())) {
    return NextResponse.json({ error: "Accès refusé" }, { status: 403 });
  }

  const { id } = await params;
  const user = await dbSelectOne<AdminUser>(
    "admin_users",
    `select=id,email,name,role,active,last_login,created_at&id=eq.${id}`
  );

  if (!user) {
    return NextResponse.json({ error: "Utilisateur non trouvé" }, { status: 404 });
  }

  return NextResponse.json(user);
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!(await checkAdminAuth())) {
    return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  }

  try {
    const payload = await getAdminUser();
    if (payload?.role !== "admin") {
      return NextResponse.json({ error: "Accès refusé" }, { status: 403 });
    }

    const { id } = await params;
    const data = await request.json();

    // Ne pas permettre de modifier le password_hash directement (sauf via champ password)
    const updateData: Record<string, unknown> = {};
    if (data.name !== undefined) updateData.name = sanitizeString(data.name, 100);
    if (data.email !== undefined) {
      const email = sanitizeString(data.email, 254);
      if (!isValidEmail(email)) {
        return NextResponse.json({ error: "Email invalide" }, { status: 400 });
      }
      updateData.email = email;
    }
    if (data.role !== undefined) {
      const role = sanitizeString(data.role, 20);
      if (!VALID_ROLES.has(role)) {
        return NextResponse.json({ error: "Rôle invalide" }, { status: 400 });
      }
      updateData.role = role;
    }
    if (data.active !== undefined) updateData.active = data.active;
    if (data.password)             updateData.password_hash = await hashPassword(data.password.slice(0, 128));

    const updated = await dbUpdate<AdminUser>("admin_users", `id=eq.${id}`, updateData);

    if (!updated) {
      return NextResponse.json({ error: "Utilisateur non trouvé" }, { status: 404 });
    }

    const safeUser = { ...(updated as unknown as Record<string, unknown>) };
    delete safeUser.password_hash;
    return NextResponse.json(safeUser);
  } catch (error) {
    console.error("[PATCH /api/admin/users/[id]]", error);
    return NextResponse.json({ error: "Erreur lors de la mise à jour" }, { status: 500 });
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!(await checkAdminAuth())) {
    return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  }

  try {
    const payload = await getAdminUser();
    if (payload?.role !== "admin") {
      return NextResponse.json({ error: "Accès refusé" }, { status: 403 });
    }

    const { id } = await params;
    // Désactivation douce (soft delete)
    await dbUpdate("admin_users", `id=eq.${id}`, { active: false });
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[DELETE /api/admin/users/[id]]", error);
    return NextResponse.json({ error: "Erreur lors de la suppression" }, { status: 500 });
  }
}
