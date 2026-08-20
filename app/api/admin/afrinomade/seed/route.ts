import { NextResponse } from 'next/server';
import { dbInsert } from '@/lib/db';
import { checkAdminRole } from '@/lib/api-auth';
import type { AfriNomadeDemande, LigneCotation } from '@/lib/afrinomade-types';
import { calcPrixClient } from '@/lib/afrinomade-types';

function ligne(
  id: string, poste: string, description: string,
  cout_reel: number, quantite: number, unite: string,
): LigneCotation {
  const prix_client = calcPrixClient(cout_reel);
  return {
    id, poste, description, cout_reel, quantite, unite,
    prix_client,
    total_cout: cout_reel * quantite,
    total_facture: prix_client * quantite,
    marge_pct: Math.round(((prix_client - cout_reel) / cout_reel) * 100),
  };
}

const FAKE_DEMANDES: Omit<AfriNomadeDemande, 'id' | 'created_at' | 'updated_at'>[] = [
  {
    statut: 'nouveau',
    nom: 'Koné', prenom: 'Aminata',
    email: 'aminata.kone@gmail.com', telephone: '+225 07 11 22 33',
    pays_residence: 'Côte d\'Ivoire',
    pays_destination: 'Sénégal',
    villes: ['Dakar', 'Île de Gorée', 'Saly'],
    type_service: 'Loisirs & Détente',
    date_depart: '2025-07-10', date_retour: '2025-07-17', nb_nuits: 7,
    nb_adultes: 2, nb_enfants: 1, ages_enfants: '8 ans',
    type_hebergement: 'Hôtel 4 étoiles',
    activites: ['Visite île de Gorée', 'Excursion Lac Rose', 'Pirogue Sine-Saloum'],
    type_vehicule: 'Berline climatisée', langue_guide: 'Français',
    budget: '1 500 000 - 2 000 000 FCFA',
    commentaire: 'Première fois au Sénégal, on souhaite un programme équilibré culture et plage.',
    cotation: [],
    montant_total: 0,
  },
  {
    statut: 'en_cours',
    nom: 'Touré', prenom: 'Ibrahim',
    email: 'ibrahim.toure@entreprise.ci', telephone: '+225 05 44 55 66',
    pays_residence: 'Côte d\'Ivoire',
    pays_destination: 'Maroc',
    villes: ['Marrakech', 'Chefchaouen', 'Fès'],
    type_service: 'Circuit culturel',
    date_depart: '2025-08-02', date_retour: '2025-08-10', nb_nuits: 8,
    nb_adultes: 4, nb_enfants: 0,
    type_hebergement: 'Riad traditionnel',
    activites: ['Médina de Marrakech', 'Désert d\'Agafay', 'Tanneries de Fès'],
    type_vehicule: 'Minibus 8 places', langue_guide: 'Français / Arabe',
    budget: '3 000 000 - 4 000 000 FCFA',
    commentaire: 'Voyage d\'entreprise, 4 cadres dirigeants. Besoin de prestations haut de gamme.',
    cotation: [],
    montant_total: 0,
  },
  {
    statut: 'cote',
    nom: 'Diallo', prenom: 'Fatou',
    email: 'fatou.diallo@yahoo.fr', telephone: '+225 01 77 88 99',
    pays_residence: 'France',
    pays_destination: 'Côte d\'Ivoire',
    villes: ['Abidjan', 'Grand-Bassam', 'Assinie'],
    type_service: 'Découverte & Nature',
    date_depart: '2025-06-20', date_retour: '2025-06-27', nb_nuits: 7,
    nb_adultes: 3, nb_enfants: 2, ages_enfants: '5 ans, 10 ans',
    type_hebergement: 'Lodge bord de mer',
    activites: ['Visite Grand-Bassam patrimoine UNESCO', 'Lagune de Tiagba', 'Village de pêcheurs'],
    type_vehicule: '4x4 avec chauffeur', langue_guide: 'Français',
    budget: '2 000 000 - 2 500 000 FCFA',
    commentaire: 'Diaspora de retour au pays. Envie de montrer la Côte d\'Ivoire à nos enfants nés en France.',
    cotation: [
      ligne('h1', 'Hébergement', 'Lodge 3 nuits Assinie + 4 nuits Abidjan', 85000, 7, 'nuit'),
      ligne('t1', 'Transport', '4x4 avec chauffeur 7 jours', 55000, 7, 'jour'),
      ligne('g1', 'Guide francophone', 'Guide certifié plein temps', 40000, 5, 'jour'),
      ligne('a1', 'Visite Grand-Bassam', 'Entrée + guide local UNESCO', 15000, 5, 'pers'),
      ligne('a2', 'Excursion lagune', 'Pirogue + repas poisson', 25000, 5, 'pers'),
      ligne('r1', 'Repas', 'Petit-déjeuner inclus 7 jours', 8000, 7, 'jour/pers'),
    ],
    montant_total: 0,
  },
  {
    statut: 'confirme',
    nom: 'Ouédraogo', prenom: 'Boureima',
    email: 'boureima.ouedraogo@gmail.com', telephone: '+226 70 11 22 33',
    pays_residence: 'Burkina Faso',
    pays_destination: 'Ghana',
    villes: ['Accra', 'Cape Coast', 'Kumasi'],
    type_service: 'Histoire & Patrimoine',
    date_depart: '2025-05-15', date_retour: '2025-05-20', nb_nuits: 5,
    nb_adultes: 2, nb_enfants: 0,
    type_hebergement: 'Hôtel 3 étoiles',
    activites: ['Château de Cape Coast', 'Kakum National Park', 'Marché Kumasi'],
    type_vehicule: 'Berline climatisée', langue_guide: 'Anglais / Français',
    budget: '1 000 000 - 1 500 000 FCFA',
    commentaire: 'Voyage culturel axé sur l\'histoire de l\'Afrique de l\'Ouest.',
    cotation: [
      ligne('h1', 'Hébergement', 'Hôtel 3* Accra + Cape Coast', 55000, 5, 'nuit'),
      ligne('t1', 'Transport', 'Berline Accra-Cape Coast-Kumasi', 45000, 5, 'jour'),
      ligne('g1', 'Guide bilingue', 'Guide certifié FR/EN', 35000, 4, 'jour'),
      ligne('a1', 'Château Cape Coast', 'Entrée + visite guidée', 20000, 2, 'pers'),
      ligne('a2', 'Kakum Canopy Walk', 'Accès + guide local', 18000, 2, 'pers'),
    ],
    montant_total: 0,
    acompte: 500000,
  },
  {
    statut: 'annule',
    nom: 'Camara', prenom: 'Mariama',
    email: 'mariama.camara@orange.ci', telephone: '+225 07 33 44 55',
    pays_residence: 'Côte d\'Ivoire',
    pays_destination: 'Bénin',
    villes: ['Cotonou', 'Ouidah', 'Ganvié'],
    type_service: 'Voyage Roots',
    date_depart: '2025-04-01', date_retour: '2025-04-06', nb_nuits: 5,
    nb_adultes: 1, nb_enfants: 0,
    type_hebergement: 'Guesthouse locale',
    activites: ['Route des esclaves Ouidah', 'Village lacustre Ganvié', 'Marché Dantokpa'],
    type_vehicule: 'Moto-taxi + embarcation', langue_guide: 'Français',
    budget: '800 000 - 1 000 000 FCFA',
    commentaire: 'Annulé — raisons personnelles (changement de date de mariage).',
    cotation: [],
    montant_total: 0,
  },
  {
    statut: 'nouveau',
    nom: 'N\'Guessan', prenom: 'Arsène',
    email: 'arsene.nguessan@etu.ci', telephone: '+225 05 66 77 88',
    pays_residence: 'Côte d\'Ivoire',
    pays_destination: 'Togo',
    villes: ['Lomé', 'Kpalimé', 'Cascade de Kpimé'],
    type_service: 'Weekend Nature',
    date_depart: '2025-06-06', date_retour: '2025-06-09', nb_nuits: 3,
    nb_adultes: 5, nb_enfants: 0,
    type_hebergement: 'Eco-lodge',
    activites: ['Cascade de Kpimé', 'Randonnée Kpalimé', 'Marché artisanal Lomé'],
    type_vehicule: 'Minibus', langue_guide: 'Français',
    budget: '500 000 - 800 000 FCFA',
    commentaire: 'Groupe d\'amis, budget serré, on veut découvrir Lomé et la nature togolaise.',
    cotation: [],
    montant_total: 0,
  },
  {
    statut: 'en_cours',
    nom: 'Bamba', prenom: 'Seydou',
    email: 'seydou.bamba@corporate.com', telephone: '+225 07 99 00 11',
    pays_residence: 'Côte d\'Ivoire',
    pays_destination: 'Sénégal',
    villes: ['Dakar', 'Saint-Louis', 'Delta du Saloum'],
    type_service: 'Business & Loisirs',
    date_depart: '2025-09-05', date_retour: '2025-09-12', nb_nuits: 7,
    nb_adultes: 6, nb_enfants: 0,
    type_hebergement: 'Hôtel 5 étoiles',
    activites: ['Lac Rose', 'Delta du Saloum en pirogue', 'Dîner de gala Dakar'],
    type_vehicule: 'Minibus VIP', langue_guide: 'Français',
    budget: '6 000 000 - 8 000 000 FCFA',
    commentaire: 'Séminaire d\'équipe 6 personnes. Moitié travail, moitié tourisme. Budget confortable.',
    cotation: [],
    montant_total: 0,
  },
  {
    statut: 'cote',
    nom: 'Yao', prenom: 'Christiane',
    email: 'christiane.yao@famille.ci', telephone: '+225 01 22 33 44',
    pays_residence: 'Côte d\'Ivoire',
    pays_destination: 'Maroc',
    villes: ['Marrakech', 'Désert d\'Agafay', 'Essaouira'],
    type_service: 'Lune de miel',
    date_depart: '2025-10-18', date_retour: '2025-10-25', nb_nuits: 7,
    nb_adultes: 2, nb_enfants: 0,
    type_hebergement: 'Riad romantique / Suite',
    activites: ['Montgolfière Agafay', 'Hammam traditionnel', 'Dîner aux chandelles médina'],
    type_vehicule: 'Berline avec chauffeur privé', langue_guide: 'Français',
    budget: '3 500 000 - 4 500 000 FCFA',
    commentaire: 'Voyage de noces. On veut des expériences uniques et romantiques, budget flexible.',
    cotation: [
      ligne('h1', 'Riad suite nuptiale', 'Riad 5* Marrakech 5 nuits + Essaouira 2 nuits', 180000, 7, 'nuit'),
      ligne('t1', 'Berline privée', 'Chauffeur dédié tout le séjour', 95000, 7, 'jour'),
      ligne('a1', 'Montgolfière Agafay', 'Vol au lever du soleil pour 2', 320000, 1, 'forfait'),
      ligne('a2', 'Hammam premium', 'Hammam + soins pour 2', 85000, 1, 'forfait'),
      ligne('a3', 'Dîner médina', 'Restaurant gastronomique, menu spécial', 120000, 2, 'pers'),
      ligne('g1', 'Guide personnel', 'Guide dédié 4 demi-journées', 60000, 4, 'demi-j'),
    ],
    montant_total: 0,
  },
  {
    statut: 'confirme',
    nom: 'Mensah', prenom: 'Kofi',
    email: 'kofi.mensah@global.gh', telephone: '+233 24 111 222',
    pays_residence: 'Ghana',
    pays_destination: 'Côte d\'Ivoire',
    villes: ['Abidjan', 'Yamoussoukro', 'Man'],
    type_service: 'Découverte Côte d\'Ivoire',
    date_depart: '2025-05-28', date_retour: '2025-06-04', nb_nuits: 7,
    nb_adultes: 3, nb_enfants: 1, ages_enfants: '12 ans',
    type_hebergement: 'Hôtel 4 étoiles',
    activites: ['Basilique Yamoussoukro', 'Forêt de Man', 'Lagune Ébrié'],
    type_vehicule: '4x4 avec chauffeur', langue_guide: 'Anglais / Français',
    budget: '2 500 000 - 3 000 000 FCFA',
    commentaire: 'Famille ghanéenne visitant la Côte d\'Ivoire pour la première fois. Guide anglophone indispensable.',
    cotation: [
      ligne('h1', 'Hébergement', 'Hôtel 4* Abidjan 4n + Yamoussoukro 3n', 75000, 7, 'nuit'),
      ligne('t1', 'Transport', '4x4 + chauffeur Abidjan-Yam-Man', 60000, 7, 'jour'),
      ligne('g1', 'Guide bilingue EN/FR', 'Guide certifié plein temps', 45000, 7, 'jour'),
      ligne('a1', 'Basilique Yamoussoukro', 'Visite guidée + entrée', 10000, 4, 'pers'),
      ligne('a2', 'Forêt Man', 'Trek guidé + cascade', 20000, 4, 'pers'),
    ],
    montant_total: 0,
    acompte: 750000,
  },
  {
    statut: 'nouveau',
    nom: 'Sy', prenom: 'Aïssatou',
    email: 'aissatou.sy@sn.net', telephone: '+221 77 333 444',
    pays_residence: 'Sénégal',
    pays_destination: 'Côte d\'Ivoire',
    villes: ['Abidjan', 'Assinie', 'Grand-Bassam'],
    type_service: 'Vacances plage',
    date_depart: '2025-08-14', date_retour: '2025-08-21', nb_nuits: 7,
    nb_adultes: 2, nb_enfants: 3, ages_enfants: '4 ans, 7 ans, 11 ans',
    type_hebergement: 'Resort bord de mer',
    activites: ['Plage d\'Assinie', 'Village de pêcheurs', 'Grand-Bassam historique'],
    type_vehicule: 'Minibus familial', langue_guide: 'Français',
    budget: '2 000 000 - 2 500 000 FCFA',
    commentaire: 'Famille de 5. Les enfants adorent la plage. On veut un hébergement tout compris avec piscine.',
    cotation: [],
    montant_total: 0,
  },
];

export async function POST() {
  if (!(await checkAdminRole())) {
    return NextResponse.json({ error: 'Non autorisé' }, { status: 401 });
  }

  const results: { success: number; errors: string[] } = { success: 0, errors: [] };

  for (const demande of FAKE_DEMANDES) {
    try {
      // Recalcule montant_total depuis cotation si présente
      if (demande.cotation && demande.cotation.length > 0) {
        const total = demande.cotation.reduce((s, l) => s + l.total_facture, 0);
        demande.montant_total = total;
        const voyageurs = (demande.nb_adultes ?? 1) + (demande.nb_enfants ?? 0);
        demande.montant_par_personne = Math.round(total / voyageurs);
        if (!demande.acompte) demande.acompte = Math.round(total * 0.5);
      }
      await dbInsert<AfriNomadeDemande>('afrinomade_demandes', demande);
      results.success++;
    } catch (err) {
      results.errors.push(`${demande.prenom} ${demande.nom}: ${String(err)}`);
    }
  }

  return NextResponse.json({
    message: `${results.success} demandes créées${results.errors.length ? `, ${results.errors.length} erreurs` : ''}`,
    ...results,
  });
}
