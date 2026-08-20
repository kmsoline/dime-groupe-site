import { NextRequest, NextResponse } from "next/server";
import { checkAdminAuth, checkAdminRole } from "@/lib/api-auth";
import { dbUpdate, dbDelete } from "@/lib/db";

type P = { params: Promise<{ id: string }> };

function isUUID(s: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s);
}

const ALLOWED = [
  "title", "slug", "img", "location", "capacity",
  "price", "type", "amenities", "description",
  "badge", "active", "sort_order",
] as const;

export async function PATCH(request: NextRequest, { params }: P) {
  if (!(await checkAdminRole())) return NextResponse.json({ error: "Non autorisé" }, { status: 401 });

  const { id } = await params;
  if (!isUUID(id)) return NextResponse.json({ error: "ID invalide" }, { status: 400 });

  let raw: Record<string, unknown>;
  try { raw = await request.json(); } catch {
    return NextResponse.json({ error: "JSON invalide" }, { status: 400 });
  }

  const payload: Record<string, unknown> = {};
  for (const f of ALLOWED) { if (f in raw) payload[f] = raw[f]; }
  if (Object.keys(payload).length === 0)
    return NextResponse.json({ error: "Aucun champ valide" }, { status: 400 });

  try {
    const item = await dbUpdate("afrinomade_residences", `id=eq.${id}`, payload);
    return NextResponse.json(item);
  } catch (e) {
    console.error("[residences PATCH]", e);
    return NextResponse.json({ error: "Erreur mise à jour" }, { status: 500 });
  }
}

export async function DELETE(_: NextRequest, { params }: P) {
  if (!(await checkAdminRole())) return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  const { id } = await params;
  if (!isUUID(id)) return NextResponse.json({ error: "ID invalide" }, { status: 400 });
  try {
    await dbDelete("afrinomade_residences", `id=eq.${id}`);
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("[residences DELETE]", e);
    return NextResponse.json({ error: "Erreur suppression" }, { status: 500 });
  }
}
