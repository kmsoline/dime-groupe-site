import { NextRequest, NextResponse } from "next/server";
import { checkAdminAuth, checkAdminRole } from "@/lib/api-auth";
import { getClientIP } from "@/lib/security";
import { writeFile, mkdir, readdir, stat } from "fs/promises";
import { join, extname } from "path";
import { existsSync } from "fs";

const PUBLIC_DIR = join(process.cwd(), "public");
const UPLOAD_DIR = join(PUBLIC_DIR, "uploads");

const IMAGE_EXTS = new Set([".jpg", ".jpeg", ".png", ".webp", ".gif", ".svg", ".avif", ".ico"]);

// Dossiers exclus du scan
const EXCLUDED_DIRS = new Set(["_next", ".next", "node_modules"]);

// ===== LIMITES =====
const MAX_FILE_SIZE = 5 * 1024 * 1024;   // 5 MB
const MAX_FILES_PER_REQUEST = 10;

// ===== RATE LIMITING UPLOAD (20/heure par IP) =====
interface UploadEntry { count: number; windowStart: number }
const uploadStore = new Map<string, UploadEntry>();

function checkUploadRateLimit(ip: string): { allowed: boolean; retryAfter?: number } {
  const now = Date.now();
  const windowMs = 60 * 60 * 1000; // 1 heure
  const entry = uploadStore.get(ip);
  if (!entry || now - entry.windowStart >= windowMs) {
    uploadStore.set(ip, { count: 1, windowStart: now });
    return { allowed: true };
  }
  entry.count += 1;
  if (entry.count > 20) {
    const retryAfter = Math.ceil((entry.windowStart + windowMs - now) / 1000);
    return { allowed: false, retryAfter };
  }
  return { allowed: true };
}

// ===== MAGIC BYTES =====

/**
 * Vérifie le type MIME réel en lisant les premiers bytes.
 * Retourne false si le fichier est suspect.
 */
function validateMagicBytes(buffer: Buffer, ext: string): boolean {
  if (buffer.length < 4) return false;

  switch (ext) {
    case ".jpg":
    case ".jpeg":
      // FF D8 FF
      return buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff;

    case ".png":
      // 89 50 4E 47 0D 0A 1A 0A
      return (
        buffer[0] === 0x89 &&
        buffer[1] === 0x50 &&
        buffer[2] === 0x4e &&
        buffer[3] === 0x47
      );

    case ".gif":
      // GIF87a ou GIF89a
      return (
        buffer[0] === 0x47 && buffer[1] === 0x49 && buffer[2] === 0x46 && buffer[3] === 0x38
      );

    case ".webp":
      // RIFF....WEBP
      if (buffer.length < 12) return false;
      return (
        buffer[0] === 0x52 && buffer[1] === 0x49 && buffer[2] === 0x46 && buffer[3] === 0x46 &&
        buffer[8] === 0x57 && buffer[9] === 0x45 && buffer[10] === 0x42 && buffer[11] === 0x50
      );

    case ".svg": {
      const full = buffer.toString("utf8").toLowerCase();
      // Catch every on* event handler regardless of surrounding whitespace
      if (/\bon[a-z]+[\s\r\n]*=/.test(full)) return false;
      const SVG_DENY = [
        "<script", "javascript:", "xlink:href",
        "<foreignobject", "<use", "<animate", "<set",
        "data:text/html", "data:application/",
      ];
      if (SVG_DENY.some((p) => full.includes(p))) return false;
      return full.includes("<svg");
    }

    case ".avif":
    case ".ico":
      // Autoriser par extension uniquement (magic bytes complexes/variables)
      return true;

    default:
      return false;
  }
}

/**
 * Vérifie qu'un nom de fichier ne contient pas de path traversal.
 */
function isSafeFilename(name: string): boolean {
  if (!name || name.trim() === "") return false;
  // Interdire .. et /
  if (name.includes("..") || name.includes("/") || name.includes("\\")) return false;
  // Interdire les null bytes
  if (name.includes("\0")) return false;
  // Limiter la longueur
  if (name.length > 255) return false;
  return true;
}

// ===== TYPES =====

export interface MediaFile {
  id: string;
  filename: string;
  url: string;
  folder: string;
  folderLabel: string;
  size: number;
  ext: string;
  uploadedAt: string;
  deletable: boolean;
}

function folderLabel(folder: string): string {
  if (!folder || folder === "") return "Racine";
  const map: Record<string, string> = {
    uploads: "Téléversements",
    images: "Images du site",
    portfolio: "Portfolio",
    team: "Équipe",
    "afrinomade": "AfriNomade",
    "afrinomade/photos": "AfriNomade · Photos",
    "afrinomade/icons": "AfriNomade · Icônes",
  };
  return map[folder] ?? folder;
}

async function scanDir(dir: string, relFolder: string, results: MediaFile[]) {
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    if (entry.isDirectory()) {
      if (!EXCLUDED_DIRS.has(entry.name)) {
        const sub = relFolder ? `${relFolder}/${entry.name}` : entry.name;
        await scanDir(join(dir, entry.name), sub, results);
      }
    } else if (entry.isFile()) {
      const ext = extname(entry.name).toLowerCase();
      if (!IMAGE_EXTS.has(ext)) continue;
      const fullPath = join(dir, entry.name);
      const relativePath = relFolder ? `${relFolder}/${entry.name}` : entry.name;
      let fileStats;
      try { fileStats = await stat(fullPath); } catch { continue; }
      const id = Buffer.from(relativePath).toString("base64url");
      results.push({
        id,
        filename: entry.name,
        url: `/${relativePath.replace(/\\/g, "/")}`,
        folder: relFolder || "",
        folderLabel: folderLabel(relFolder || ""),
        size: fileStats.size,
        ext: ext.slice(1),
        uploadedAt: fileStats.mtime.toISOString(),
        deletable: relFolder === "uploads",
      });
    }
  }
}

export async function GET(request: NextRequest) {
  if (!(await checkAdminAuth())) {
    return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  }
  try {
    if (!existsSync(UPLOAD_DIR)) await mkdir(UPLOAD_DIR, { recursive: true });
    const results: MediaFile[] = [];
    await scanDir(PUBLIC_DIR, "", results);
    results.sort((a, b) => new Date(b.uploadedAt).getTime() - new Date(a.uploadedAt).getTime());
    return NextResponse.json(results);
  } catch (error) {
    console.error("[Media GET]", error);
    return NextResponse.json({ error: "Erreur lors du chargement" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  if (!(await checkAdminRole())) {
    return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  }

  // Rate limiting uploads
  const ip = getClientIP(request);
  const rl = checkUploadRateLimit(ip);
  if (!rl.allowed) {
    return NextResponse.json(
      { error: "Limite d'upload atteinte — réessayez dans une heure" },
      { status: 429, headers: { "Retry-After": String(rl.retryAfter ?? 3600) } }
    );
  }

  try {
    if (!existsSync(UPLOAD_DIR)) await mkdir(UPLOAD_DIR, { recursive: true });

    const formData = await request.formData();
    const files = formData.getAll("files") as File[];

    if (files.length === 0) {
      return NextResponse.json({ error: "Aucun fichier fourni" }, { status: 400 });
    }

    // Limite du nombre de fichiers
    if (files.length > MAX_FILES_PER_REQUEST) {
      return NextResponse.json(
        { error: `Maximum ${MAX_FILES_PER_REQUEST} fichiers par requête` },
        { status: 400 }
      );
    }

    const errors: string[] = [];
    const uploaded: MediaFile[] = [];

    for (const file of files) {
      // Vérification taille
      if (file.size > MAX_FILE_SIZE) {
        errors.push(`${file.name} : fichier trop volumineux (max 5 MB)`);
        continue;
      }

      // Vérification extension
      const ext = extname(file.name).toLowerCase();
      if (!IMAGE_EXTS.has(ext)) {
        errors.push(`${file.name} : extension non autorisée`);
        continue;
      }

      // Vérification type MIME déclaré
      if (!file.type.startsWith("image/")) {
        errors.push(`${file.name} : type MIME non autorisé`);
        continue;
      }

      // Vérification nom de fichier (path traversal)
      if (!isSafeFilename(file.name)) {
        errors.push(`${file.name} : nom de fichier non autorisé`);
        continue;
      }

      const buffer = Buffer.from(await file.arrayBuffer());

      // Vérification magic bytes
      if (!validateMagicBytes(buffer, ext)) {
        errors.push(`${file.name} : contenu du fichier invalide ou potentiellement dangereux`);
        continue;
      }

      // Générer un nom sécurisé
      const ts = Date.now();
      const rand = Math.random().toString(36).slice(2, 7);
      const baseName = file.name
        .replace(/\.[^.]+$/, "")
        .replace(/[^a-zA-Z0-9-_]/g, "-")
        .slice(0, 40);
      const filename = `${baseName}-${ts}-${rand}${ext}`;
      const filePath = join(UPLOAD_DIR, filename);

      await writeFile(filePath, buffer);

      const relativePath = `uploads/${filename}`;
      uploaded.push({
        id: Buffer.from(relativePath).toString("base64url"),
        filename,
        url: `/${relativePath}`,
        folder: "uploads",
        folderLabel: "Téléversements",
        size: file.size,
        ext: ext.slice(1),
        uploadedAt: new Date().toISOString(),
        deletable: true,
      });
    }

    if (uploaded.length === 0 && errors.length > 0) {
      return NextResponse.json({ error: errors.join("; ") }, { status: 400 });
    }

    return NextResponse.json(
      { uploaded, errors: errors.length > 0 ? errors : undefined },
      { status: 201 }
    );
  } catch (error) {
    console.error("[Media POST]", error);
    return NextResponse.json({ error: "Erreur lors de l'upload" }, { status: 500 });
  }
}
