import { NextRequest, NextResponse } from "next/server";
import { checkAdminAuth, checkAdminRole } from "@/lib/api-auth";
import { getContentSetting, setContentSetting } from "@/lib/db";
import { getAfriNomadeContent } from "@/lib/content-data";

export async function GET(request: NextRequest) {
  if (!(await checkAdminAuth())) {
    return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  }
  try {
    const db = await getContentSetting<unknown>("afrinomade_content");
    const content = db ?? getAfriNomadeContent();
    return NextResponse.json(content);
  } catch {
    return NextResponse.json(getAfriNomadeContent());
  }
}

export async function PUT(request: NextRequest) {
  if (!(await checkAdminRole())) {
    return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  }
  try {
    const content = await request.json();
    await setContentSetting("afrinomade_content", content);
    return NextResponse.json({ success: true, content });
  } catch {
    return NextResponse.json({ error: "Erreur lors de la mise à jour" }, { status: 500 });
  }
}
