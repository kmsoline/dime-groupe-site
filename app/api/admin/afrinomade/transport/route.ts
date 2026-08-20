import { NextRequest, NextResponse } from "next/server";
import { checkAdminAuth, checkAdminRole } from "@/lib/api-auth";
import { dbSelect, dbInsert } from "@/lib/db";

export async function GET() {
  if (!(await checkAdminAuth())) return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  try {
    const items = await dbSelect("afrinomade_transport", "select=*&order=sort_order.asc,created_at.asc");
    return NextResponse.json(items);
  } catch { return NextResponse.json({ error: "Erreur chargement" }, { status: 500 }); }
}

export async function POST(request: NextRequest) {
  if (!(await checkAdminRole())) return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  try {
    const data = await request.json();
    const item = await dbInsert("afrinomade_transport", {
      title: data.title || "Nouvelle formule",
      description: data.description || "",
      price: data.price || "Sur devis",
      details: data.details || [],
      popular: data.popular ?? false,
      icon_name: data.icon_name || "Car",
      active: data.active ?? true,
      sort_order: data.sort_order ?? 0,
    });
    return NextResponse.json(item, { status: 201 });
  } catch (e) {
    console.error("[transport POST]", e);
    return NextResponse.json({ error: "Erreur création" }, { status: 500 });
  }
}
