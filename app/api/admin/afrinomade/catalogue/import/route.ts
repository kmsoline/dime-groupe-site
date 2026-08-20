/**
 * Import du catalogue AfriNomade depuis un fichier Excel.
 * POST multipart/form-data avec le champ "file"
 * mode=replace → vide la table avant import
 * mode=merge   → upsert (défaut)
 */
import { NextRequest, NextResponse } from 'next/server';
import { checkAdminRole } from '@/lib/api-auth';
import { dbInsert, dbQuery } from '@/lib/db';
import type { AfriNomadeCatalogue } from '@/lib/afrinomade-types';

const VALID_CATEGORIES = ['hebergement', 'transport', 'guide', 'repas', 'equipements', 'activites'];

function parseNum(v: unknown): number | undefined {
  if (v === null || v === undefined || v === '') return undefined;
  const n = Number(v);
  return isNaN(n) ? undefined : n;
}

function parseBool(v: unknown): boolean {
  if (typeof v === 'boolean') return v;
  if (typeof v === 'string') return v.toLowerCase().trim() === 'oui' || v === '1' || v.toLowerCase() === 'true';
  if (typeof v === 'number') return v === 1;
  return true;
}

export async function POST(req: NextRequest) {
  if (!(await checkAdminRole())) {
    return NextResponse.json({ error: 'Non autorisé' }, { status: 401 });
  }

  try {
    const formData = await req.formData();
    const file = formData.get('file') as File | null;
    const mode = (formData.get('mode') as string) ?? 'merge';

    if (mode === 'replace' && req.headers.get('X-Confirm-Replace') !== 'true') {
      return NextResponse.json({ error: 'En-tête X-Confirm-Replace: true requis pour le mode replace' }, { status: 400 });
    }

    if (!file) {
      return NextResponse.json({ error: 'Aucun fichier fourni' }, { status: 400 });
    }

    // Vérification type MIME
    const allowed = [
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'application/vnd.ms-excel',
    ];
    if (!allowed.includes(file.type) && !file.name.endsWith('.xlsx') && !file.name.endsWith('.xls')) {
      return NextResponse.json({ error: 'Format non supporté. Utilisez .xlsx ou .xls' }, { status: 400 });
    }

    if (file.size > 5 * 1024 * 1024) {
      return NextResponse.json({ error: 'Fichier trop volumineux (max 5 Mo)' }, { status: 400 });
    }

    const ExcelJS = (await import('exceljs')).default;
    const wb = new ExcelJS.Workbook();
    const buffer = await file.arrayBuffer();
    await wb.xlsx.load(buffer);

    const ws = wb.worksheets[0];
    if (!ws) {
      return NextResponse.json({ error: 'Feuille introuvable dans le fichier' }, { status: 400 });
    }

    if (ws.rowCount - 1 > 5000) {
      return NextResponse.json({ error: 'Trop de lignes (max 5000)' }, { status: 400 });
    }

    // Lire les en-têtes de la ligne 1
    const headers: string[] = [];
    ws.getRow(1).eachCell((cell) => {
      headers.push(String(cell.value ?? '').toLowerCase().trim().replace(/[*\s]/g, '_').replace(/_+/g, '_').replace(/_$/, ''));
    });

    // Mapper les colonnes
    const colMap: Record<string, number> = {};
    const ALIASES: Record<string, string> = {
      'id': 'id',
      'catégorie': 'categorie', 'categorie': 'categorie',
      'pays': 'pays',
      'libellé': 'label', 'libelle': 'label', 'label': 'label',
      'unité': 'unite', 'unite': 'unite',
      'prix_basse_sais.': 'prix_basse_saison', 'prix_basse_saison': 'prix_basse_saison',
      'prix_haute_sais.': 'prix_haute_saison', 'prix_haute_saison': 'prix_haute_saison',
      'prix_transfert': 'prix_transfert',
      'prix_½_journée': 'prix_demi_journee', 'prix_demi_journee': 'prix_demi_journee',
      'prix_journée': 'prix_journee', 'prix_journee': 'prix_journee',
      'prix/personne': 'prix_par_personne', 'prix_par_personne': 'prix_par_personne',
      'actif_(oui/non)': 'actif', 'actif': 'actif',
    };

    headers.forEach((h, i) => {
      const mapped = ALIASES[h];
      if (mapped) colMap[mapped] = i + 1;
    });

    if (!colMap.label || !colMap.categorie) {
      return NextResponse.json({
        error: 'Colonnes obligatoires manquantes. Le fichier doit avoir au moins "Catégorie" et "Libellé".',
      }, { status: 400 });
    }

    // Parser les lignes
    const items: AfriNomadeCatalogue[] = [];
    const errors: string[] = [];

    ws.eachRow((row, rowNum) => {
      if (rowNum === 1) return; // header

      const get = (field: string) => {
        const ci = colMap[field];
        if (!ci) return undefined;
        const v = row.getCell(ci).value;
        if (v === null || v === undefined) return undefined;
        if (typeof v === 'object' && 'result' in v) return v.result;
        return v;
      };

      const categorie = String(get('categorie') ?? '').trim().toLowerCase();
      const label     = String(get('label') ?? '').trim();

      if (!label && !categorie) return; // ligne vide

      if (!VALID_CATEGORIES.includes(categorie)) {
        errors.push(`Ligne ${rowNum} : catégorie invalide "${categorie}"`);
        return;
      }
      if (!label) {
        errors.push(`Ligne ${rowNum} : libellé manquant`);
        return;
      }

      items.push({
        categorie: categorie as AfriNomadeCatalogue['categorie'],
        pays: String(get('pays') ?? 'CI').trim() || 'CI',
        label,
        unite:              String(get('unite') ?? '').trim() || undefined,
        prix_basse_saison:  parseNum(get('prix_basse_saison')),
        prix_haute_saison:  parseNum(get('prix_haute_saison')),
        prix_transfert:     parseNum(get('prix_transfert')),
        prix_demi_journee:  parseNum(get('prix_demi_journee')),
        prix_journee:       parseNum(get('prix_journee')),
        prix_par_personne:  parseNum(get('prix_par_personne')),
        actif:              parseBool(get('actif') ?? true),
      });
    });

    if (items.length === 0 && errors.length === 0) {
      return NextResponse.json({ error: 'Aucune donnée valide trouvée dans le fichier' }, { status: 400 });
    }

    // Mode replace : supprimer les données existantes
    if (mode === 'replace') {
      await dbQuery('DELETE FROM afrinomade_catalogue');
    }

    // Insérer
    let inserted = 0;
    for (const item of items) {
      try {
        await dbInsert('afrinomade_catalogue', item);
        inserted++;
      } catch {
        errors.push(`Erreur lors de l'insertion de "${item.label}"`);
      }
    }

    return NextResponse.json({
      success: true,
      inserted,
      skipped: items.length - inserted,
      errors: errors.slice(0, 20),
      message: `${inserted} ligne(s) importée(s) avec succès.${errors.length ? ` ${errors.length} erreur(s).` : ''}`,
    });
  } catch (err) {
    console.error('[Catalogue import]', err);
    return NextResponse.json({ error: 'Erreur lors du traitement du fichier' }, { status: 500 });
  }
}
