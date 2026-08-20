import { NextRequest, NextResponse } from 'next/server';
import { dbSelect, dbCount, dbQuery } from '@/lib/db';
import type { AfriNomadeDemande } from '@/lib/afrinomade-types';
import { checkAdminAuth } from '@/lib/api-auth';
import { sanitizeString } from '@/lib/security';

export async function GET(req: NextRequest) {
  if (!(await checkAdminAuth())) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 });

  try {
    const VALID_STATUTS = new Set(['nouveau', 'cote', 'confirme', 'annule']);
    const { searchParams } = new URL(req.url);
    const statut   = searchParams.get('statut') ?? '';
    if (statut && statut !== 'tous' && !VALID_STATUTS.has(statut)) {
      return NextResponse.json({ error: 'Statut invalide' }, { status: 400 });
    }
    const rawSearch = searchParams.get('search') ?? '';
    const search   = sanitizeString(rawSearch, 100);
    const page     = Math.max(1, parseInt(searchParams.get('page')  ?? '1'));
    const limit    = Math.min(100, Math.max(1, parseInt(searchParams.get('limit') ?? '20')));
    const offset   = (page - 1) * limit;

    let demandes: AfriNomadeDemande[];

    if (search) {
      // ── Recherche full-text côté serveur (toute la base, pas juste la page) ──
      const params: unknown[] = [`%${search}%`];
      let statusClause = '';
      if (statut && statut !== 'tous') {
        statusClause = `AND statut = $${params.length + 1}`;
        params.push(statut);
      }
      params.push(limit, offset);
      const limitIdx  = params.length - 1;
      const offsetIdx = params.length;

      demandes = await dbQuery<AfriNomadeDemande>(
        `SELECT * FROM "afrinomade_demandes"
         WHERE (nom ILIKE $1 OR prenom ILIKE $1 OR email ILIKE $1 OR pays_destination ILIKE $1)
         ${statusClause}
         ORDER BY created_at DESC
         LIMIT $${limitIdx} OFFSET $${offsetIdx}`,
        params
      );
    } else {
      let query = `select=*&order=created_at.desc&limit=${limit}&offset=${offset}`;
      if (statut && statut !== 'tous') query += `&statut=eq.${statut}`;
      demandes = await dbSelect<AfriNomadeDemande>('afrinomade_demandes', query);
    }

    // Stats globales (indépendantes de la recherche)
    const [total, nouveaux, cotes, confirmes] = await Promise.all([
      dbCount('afrinomade_demandes'),
      dbCount('afrinomade_demandes', 'select=id&statut=eq.nouveau'),
      dbCount('afrinomade_demandes', 'select=id&statut=eq.cote'),
      dbCount('afrinomade_demandes', 'select=id&statut=eq.confirme'),
    ]);

    return NextResponse.json({
      demandes,
      stats: { total, nouveaux, cotes, confirmes },
      page,
      limit,
    });
  } catch (err) {
    console.error('[demandes GET]', err);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}
