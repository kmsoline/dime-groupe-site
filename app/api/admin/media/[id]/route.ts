import { NextRequest, NextResponse } from "next/server";
import { checkAdminRole } from "@/lib/api-auth";
import { unlink } from "fs/promises";
import { join } from "path";
import { existsSync } from "fs";

const PUBLIC_DIR = join(process.cwd(), "public");

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!(await checkAdminRole())) {
    return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  }
  try {
    const { id } = await params;
    // Décoder le chemin relatif depuis base64url
    const relativePath = Buffer.from(id, "base64url").toString("utf-8");

    // Sécurité : seuls les fichiers dans /uploads peuvent être supprimés
    if (!relativePath.startsWith("uploads/") || relativePath.includes("..")) {
      return NextResponse.json({ error: "Suppression non autorisée pour ce fichier" }, { status: 403 });
    }

    const fullPath = join(PUBLIC_DIR, relativePath);
    if (!existsSync(fullPath)) {
      return NextResponse.json({ error: "Fichier non trouvé" }, { status: 404 });
    }

    await unlink(fullPath);
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[Media DELETE]", error);
    return NextResponse.json({ error: "Erreur lors de la suppression" }, { status: 500 });
  }
}
