import { env } from "../../config/env";
import type { Prisma } from "../../database/prisma/generated/prisma/client";
import { mediaUrl, s } from "../../lib/media";
import type { EffectiveSubscription } from "../subscriptions/subscriptions.service";
import { toPlanCapabilities } from "./plan-capabilities";

// Tout ce qu'il faut charger pour reconstruire l'objet attendu par le front.
export const ficheInclude = {
  onglets: { orderBy: { position: "asc" } },
  reseaux: { orderBy: { position: "asc" } },
  liens: { orderBy: { position: "asc" } },
  horaires: { orderBy: { jour: "asc" } },
  medias: { orderBy: { position: "asc" } },
  catalogueSections: {
    orderBy: { position: "asc" },
    include: { articles: { orderBy: { position: "asc" } } },
  },
  menuSections: {
    orderBy: { position: "asc" },
    include: { plats: { orderBy: { position: "asc" } } },
  },
  biens: {
    orderBy: { position: "asc" },
    include: { photos: { orderBy: { position: "asc" } } },
  },
} satisfies Prisma.FicheInclude;

export type FicheFull = Prisma.FicheGetPayload<{
  include: typeof ficheInclude;
}>;

const JOURS = [
  "Lundi",
  "Mardi",
  "Mercredi",
  "Jeudi",
  "Vendredi",
  "Samedi",
  "Dimanche",
];
const lower = (v: string) => v.toLowerCase();

const n = (v: number | null) => v ?? undefined;
const price = (v: number | null) => (v === null ? undefined : String(v)); // le front manipule des prix en texte

// Reconstruit { ...champs à plat, data: {...} } : même format que la fiche de démonstration du front.
export function toFicheDto(f: FicheFull, sub: EffectiveSubscription | null) {
  return {
    id: f.id,
    slug: f.slug,
    formule: sub ? lower(sub.plan.type) : "essentielle", // repli d'affichage si l'abonnement a expiré
    statut: lower(f.statut),
    expiree: sub === null,
    // Droits réels de la formule (table plan_limits) ; null si expirée : le front retombe sur son repli.
    planCapabilities: sub?.plan.limits
      ? toPlanCapabilities(sub.plan, sub.plan.limits)
      : null,
    enLigneSeule: f.enLigneSeule,
    prenom: f.prenom,
    nom: f.nom,
    fonction: s(f.fonction),
    entreprise: s(f.entreprise),
    photo: mediaUrl(f.photo),
    logo: mediaUrl(f.logo),
    telephone: s(f.telephone),
    whatsapp: s(f.whatsapp),
    email: s(f.email),
    site: s(f.site),
    adresse: s(f.adresse),
    googlePlaceId: s(f.googlePlaceId),
    dateEcheance: sub?.endsAt ? sub.endsAt.toISOString().slice(0, 10) : null,
    scansTotal: f.scansTotal,
    // Version de la fiche : renvoyée par l'éditeur (baseUpdatedAt) pour détecter une modification concurrente.
    updatedAt: f.updatedAt.toISOString(),
    data: {
      secteur: f.secteur ? lower(f.secteur) : undefined,
      premierBouton: lower(f.premierBouton),
      messageWhatsapp: s(f.messageWhatsapp),
      presentation: s(f.presentation),
      reseauxSociaux: f.reseaux.map(r => ({ label: r.label, url: r.url })),
      liens: f.liens.map(l => ({ label: l.label, url: l.url })),
      horaires: f.horaires.map(h => ({
        jour: JOURS[h.jour],
        horaire: h.horaire,
      })),
      galerie: f.medias.map(m => ({
        type: lower(m.type),
        url: mediaUrl(m.url),
        alt: s(m.alt),
      })),
      sections: f.catalogueSections.map(sec => ({
        titre: sec.titre,
        articles: sec.articles.map(a => ({
          nom: a.nom,
          description: s(a.description),
          photo: mediaUrl(a.photo),
          prix: price(a.prix),
          badge: a.badge ?? undefined,
        })),
      })),
      menu: {
        sections: f.menuSections.map(sec => ({
          titre: sec.titre,
          plats: sec.plats.map(p => ({
            nom: p.nom,
            prix: price(p.prix),
            description: s(p.description),
            image: mediaUrl(p.image),
            video: mediaUrl(p.video),
            videoWebm: mediaUrl(p.videoWebm),
            badge: p.badge ?? undefined,
          })),
        })),
      },
      biens: f.biens.map(b => ({
        titre: b.titre,
        type: lower(b.type),
        prix: price(b.prix),
        periode: b.periode ?? undefined,
        ville: s(b.ville),
        surface: n(b.surface),
        terrain: n(b.terrain),
        chambres: n(b.chambres),
        sdb: n(b.sdb),
        atouts: b.atouts,
        description: s(b.description),
        photos: b.photos.map(p => mediaUrl(p.url)),
      })),
      rendezVous: { label: s(f.rdvLabel), url: s(f.rdvUrl) },
      onglets: f.onglets.map(o => ({
        id: o.id,
        type: lower(o.type),
        titre: o.titre ?? undefined,
        contenu: o.contenu ?? undefined,
        visible: o.visible,
      })),
      entete: {
        disposition: lower(f.enteteDisposition),
        taille: lower(f.enteteTaille),
        theme: f.enteteTheme ? lower(f.enteteTheme) : undefined,
        couverture: mediaUrl(f.enteteCouverture),
      },
    },
  };
}
