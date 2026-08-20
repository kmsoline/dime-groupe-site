import { NextRequest, NextResponse } from "next/server";
import { checkAdminAuth, checkAdminRole } from "@/lib/api-auth";
import { dbSelect, dbInsert } from "@/lib/db";

export async function GET() {
  if (!(await checkAdminAuth())) return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  try {
    const items = await dbSelect("afrinomade_excursions", "select=*&order=sort_order.asc,created_at.asc");
    return NextResponse.json(items);
  } catch { return NextResponse.json({ error: "Erreur chargement" }, { status: 500 }); }
}

export async function POST(request: NextRequest) {
  if (!(await checkAdminRole())) return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  try {
    const data = await request.json();
    const item = await dbInsert("afrinomade_excursions", {
      slug: data.slug || data.title?.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g,"").replace(/[^a-z0-9]+/g,"-").replace(/(^-|-$)/g,"") || Date.now().toString(),
      title: data.title || "Nouvelle excursion",
      img: data.img || "/afrinomade/photos/plage.jpg",
      duration: data.duration || "1 jour",
      price: data.price || "Sur devis",
      tags: data.tags || [],
      pays: data.pays || null,
      description: data.description || "",
      highlights: data.highlights || [],
      active: data.active ?? true,
      sort_order: data.sort_order ?? 0,
    });
    return NextResponse.json(item, { status: 201 });
  } catch (e) {
    console.error("[excursions POST]", e);
    return NextResponse.json({ error: "Erreur création" }, { status: 500 });
  }
}
