import { NextRequest, NextResponse } from "next/server";
import { checkAdminAuth, checkAdminRole } from "@/lib/api-auth";
import { dbSelect, dbInsert } from "@/lib/db";

export async function GET() {
  if (!(await checkAdminAuth())) return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  try {
    const items = await dbSelect("afrinomade_bons_plans", "select=*&order=sort_order.asc,created_at.asc");
    return NextResponse.json(items);
  } catch { return NextResponse.json({ error: "Erreur chargement" }, { status: 500 }); }
}

export async function POST(request: NextRequest) {
  if (!(await checkAdminRole())) return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  try {
    const data = await request.json();
    const item = await dbInsert("afrinomade_bons_plans", {
      category: data.category || "restaurant",
      pays: data.pays || "Côte d'Ivoire",
      name: data.name || "Nouvelle adresse",
      zone: data.zone || "",
      vibe: data.vibe || "",
      description: data.description || "",
      tags: data.tags || [],
      note: data.note || "★★★★",
      price_range: data.price_range || "€€",
      img: data.img || "",
      link: data.link || "",
      active: data.active ?? false,
      sort_order: data.sort_order ?? 0,
    });
    return NextResponse.json(item, { status: 201 });
  } catch (e) {
    console.error("[bons-plans POST]", e);
    return NextResponse.json({ error: "Erreur création" }, { status: 500 });
  }
}
