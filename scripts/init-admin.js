/**
 * Script d'initialisation : crée le premier compte admin dans Supabase
 * avec un mot de passe sécurisé (scrypt).
 *
 * Usage :
 *   SUPABASE_URL=... SUPABASE_SERVICE_KEY=... ADMIN_PASSWORD=MonMotDePasse node scripts/init-admin.js
 *
 * Ou créez un fichier .env.local et utilisez :
 *   node -r dotenv/config scripts/init-admin.js
 */

const crypto = require("crypto");

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;
const ADMIN_EMAIL = process.env.ADMIN_EMAIL;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;
const ADMIN_NAME = process.env.ADMIN_NAME || "Administrateur DIME";

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  console.error("❌ SUPABASE_URL et SUPABASE_SERVICE_KEY sont requis.");
  process.exit(1);
}
if (!ADMIN_EMAIL) {
  console.error("❌ ADMIN_EMAIL est requis.");
  process.exit(1);
}
if (!ADMIN_PASSWORD) {
  console.error("❌ ADMIN_PASSWORD est requis.");
  process.exit(1);
}

function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString("hex");
  const hash = crypto.scryptSync(password, salt, 64).toString("hex");
  return `${salt}:${hash}`;
}

async function main() {
  console.log(`\n🔧 Initialisation de l'admin DIME GROUPE`);
  console.log(`   Email    : ${ADMIN_EMAIL}`);
  console.log(`   Nom      : ${ADMIN_NAME}`);
  console.log(`   Password : ${"*".repeat(ADMIN_PASSWORD.length)}\n`);

  const password_hash = hashPassword(ADMIN_PASSWORD);

  const res = await fetch(`${SUPABASE_URL}/rest/v1/admin_users`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: SUPABASE_SERVICE_KEY,
      Authorization: `Bearer ${SUPABASE_SERVICE_KEY}`,
      Prefer: "return=representation,resolution=merge-duplicates",
    },
    body: JSON.stringify({
      email: ADMIN_EMAIL,
      password_hash,
      name: ADMIN_NAME,
      role: "admin",
      active: true,
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    console.error("❌ Erreur Supabase:", err);
    process.exit(1);
  }

  const user = await res.json();
  console.log("✅ Admin créé avec succès :");
  console.log(`   ID    : ${Array.isArray(user) ? user[0]?.id : user?.id}`);
  console.log(`   Email : ${ADMIN_EMAIL}`);
  console.log(`\n⚠️  Conservez ces identifiants en lieu sûr !`);
  console.log(`   Accès admin : https://votre-domaine.ci/admin/login\n`);
}

main().catch((e) => {
  console.error("❌ Exception:", e);
  process.exit(1);
});
