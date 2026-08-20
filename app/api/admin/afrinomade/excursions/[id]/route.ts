import { NextRequest, NextResponse } from "next/server";
import { checkAdminAuth, checkAdminRole } from "@/lib/api-auth";
import { dbUpdate, dbDelete } from "@/lib/db";

type P = { params: Promise<{ id: string }> };

/** Valide qu'une chaîne est un UUID v4 */
function isUUID(s: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s);
}

/** Whitelist — seuls ces champs peuvent être modifiés via l'API */
const ALLOWED = [
  "title", "slug", "img", "duration", "price",
  "tags", "pays", "description", "highlights",
  "active", "sort_order",
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
    const item = await dbUpdate("afrinomade_excursions", `id=eq.${id}`, payload);
    return NextResponse.json(item);
  } catch (e) {
    console.error("[excursions PATCH]", e);
    return NextResponse.json({ error: "Erreur mise à jour" }, { status: 500 });
  }
}

export async function DELETE(_: NextRequest, { params }: P) {
  if (!(await checkAdminRole())) return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  const { id } = await params;
  if (!isUUID(id)) return NextResponse.json({ error: "ID invalide" }, { status: 400 });
  try {
    await dbDelete("afrinomade_excursions", `id=eq.${id}`);
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("[excursions DELETE]", e);
    return NextResponse.json({ error: "Erreur suppression" }, { status: 500 });
  }
}
