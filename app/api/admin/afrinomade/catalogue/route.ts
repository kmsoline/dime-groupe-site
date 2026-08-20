import { NextRequest, NextResponse } from 'next/server';
import { dbSelect, dbInsert, dbUpdate, dbDelete } from '@/lib/db';
import type { AfriNomadeCatalogue } from '@/lib/afrinomade-types';
import { checkAdminAuth, checkAdminRole } from '@/lib/api-auth';

export async function GET(_: NextRequest) {
  if (!(await checkAdminAuth())) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 });
  try {
    const items = await dbSelect<AfriNomadeCatalogue>('afrinomade_catalogue', 'select=*&order=categorie.asc,pays.asc,label.asc');
    return NextResponse.json(items);
  } catch {
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  if (!(await checkAdminRole())) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 });
  try {
    const body = await req.json();
    const { categorie, pays, label, unite, prix_basse_saison, prix_haute_saison, prix_transfert, prix_demi_journee, prix_journee, prix_par_personne, actif } = body;
    const item = await dbInsert<AfriNomadeCatalogue>('afrinomade_catalogue', { categorie, pays, label, unite, prix_basse_saison, prix_haute_saison, prix_transfert, prix_demi_journee, prix_journee, prix_par_personne, actif });
    return NextResponse.json(item, { status: 201 });
  } catch {
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  if (!(await checkAdminRole())) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 });
  try {
    const { id, ...body }: AfriNomadeCatalogue & { id: string } = await req.json();
    const item = await dbUpdate<AfriNomadeCatalogue>('afrinomade_catalogue', `id=eq.${id}`, body);
    return NextResponse.json(item);
  } catch {
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  if (!(await checkAdminRole())) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 });
  try {
    const { id } = await req.json();
    await dbDelete('afrinomade_catalogue', `id=eq.${id}`);
    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}
