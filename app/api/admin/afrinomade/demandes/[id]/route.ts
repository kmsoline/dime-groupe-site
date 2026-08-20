import { NextRequest, NextResponse } from 'next/server';
import { dbSelectOne, dbUpdate, dbDelete } from '@/lib/db';
import type { AfriNomadeDemande, LigneCotation } from '@/lib/afrinomade-types';
import { calcPrixClient } from '@/lib/afrinomade-types';
import { checkAdminAuth, checkAdminRole } from '@/lib/api-auth';

export async function GET(_: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!(await checkAdminAuth())) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 });
  const { id } = await params;
  try {
    const demande = await dbSelectOne<AfriNomadeDemande>('afrinomade_demandes', `select=*&id=eq.${id}`);
    if (!demande) return NextResponse.json({ error: 'Introuvable' }, { status: 404 });
    return NextResponse.json(demande);
  } catch {
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}

const PATCH_ALLOWED = ['statut', 'notes_internes', 'cotation', 'montant_total', 'formules', 'itineraire', 'reference'] as const;

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!(await checkAdminRole())) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 });
  const { id } = await params;
  try {
    const body = await req.json();
    const payload: Record<string, unknown> = {};
    for (const f of PATCH_ALLOWED) { if (f in body) payload[f] = body[f as keyof typeof body]; }
    if (Object.keys(payload).length === 0) return NextResponse.json({ error: 'Aucun champ valide' }, { status: 400 });
    const updated = await dbUpdate<AfriNomadeDemande>('afrinomade_demandes', `id=eq.${id}`, payload);
    return NextResponse.json(updated);
  } catch {
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}

export async function DELETE(_: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!(await checkAdminRole())) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 });
  const { id } = await params;
  try {
    await dbDelete('afrinomade_demandes', `id=eq.${id}`);
    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}
