import type {
  Disposition,
  PlanLimit,
  TabType,
  Theme,
} from "../../database/prisma/generated/prisma/client";
import { unprocessable } from "../../lib/httpError";
import type { UpdateFicheInput } from "./fiches.schemas";

type Violation = { champ: string; message: string };

// Vérifie le contenu reçu contre les droits de la formule (table plan_limits).
// Retourne l'entrée nettoyée, ou lève une erreur 422 listant TOUTES les violations.
export function enforcePlanLimits(
  limits: PlanLimit,
  input: UpdateFicheInput
): UpdateFicheInput {
  const v: Violation[] = [];
  const add = (champ: string, message: string) => v.push({ champ, message });
  const d = input.data;
  if (!d) return input;

  if (
    d.presentation !== undefined &&
    d.presentation.length > limits.maxPresentation
  )
    add(
      "data.presentation",
      `${limits.maxPresentation} caractères maximum avec cette formule`
    );

  if (d.reseauxSociaux && d.reseauxSociaux.length > limits.maxSocial)
    add(
      "data.reseauxSociaux",
      `${limits.maxSocial} réseaux sociaux maximum avec cette formule`
    );

  if (d.liens && d.liens.length > limits.maxLinks)
    add(
      "data.liens",
      limits.maxLinks === 0
        ? "Les liens ne sont pas inclus dans cette formule"
        : `${limits.maxLinks} liens maximum`
    );

  if (d.galerie) {
    const photos = d.galerie.filter(m => m.type === "image").length;
    const videos = d.galerie.filter(m => m.type === "video").length;
    if (photos > limits.maxPhotos)
      add(
        "data.galerie",
        `${limits.maxPhotos} photo(s) maximum avec cette formule`
      );
    if (videos > limits.maxVideos)
      add(
        "data.galerie",
        `${limits.maxVideos} vidéo(s) maximum avec cette formule`
      );
  }

  if (d.sections && d.sections.length > 0) {
    if (!limits.hasCatalog)
      add("data.sections", "Le catalogue n'est pas inclus dans cette formule");
    else {
      if (d.sections.length > limits.maxCatalogSections)
        add(
          "data.sections",
          `${limits.maxCatalogSections} sections de catalogue maximum`
        );
      d.sections.forEach((s, i) => {
        if (s.articles.length > limits.maxCatalogArticlesPerSection)
          add(
            `data.sections[${i}].articles`,
            `${limits.maxCatalogArticlesPerSection} articles maximum par section`
          );
        if (!limits.catalogPrices && s.articles.some(a => a.prix !== undefined))
          add(
            `data.sections[${i}].articles`,
            "Les prix ne sont pas disponibles avec cette formule"
          );
      });
    }
  }

  if (d.menu && d.menu.sections.length > 0) {
    if (!limits.hasMenu)
      add(
        "data.menu",
        "Le menu interactif n'est pas inclus dans cette formule"
      );
    else {
      if (d.menu.sections.length > limits.maxMenuSections)
        add("data.menu", `${limits.maxMenuSections} sections de menu maximum`);
      d.menu.sections.forEach((s, i) => {
        if (s.plats.length > limits.maxMenuItemsPerSection)
          add(
            `data.menu.sections[${i}].plats`,
            `${limits.maxMenuItemsPerSection} plats maximum par section`
          );
        if (
          !limits.menuVideoPerItem &&
          s.plats.some(p => p.video || p.videoWebm)
        )
          add(
            `data.menu.sections[${i}].plats`,
            "Les vidéos par plat ne sont pas disponibles avec cette formule"
          );
      });
    }
  }

  if (d.biens && d.biens.length > 0) {
    if (!limits.hasBiens)
      add(
        "data.biens",
        "Les biens immobiliers ne sont pas inclus dans cette formule"
      );
    else {
      if (d.biens.length > limits.maxBiens)
        add("data.biens", `${limits.maxBiens} biens maximum`);
      d.biens.forEach((b, i) => {
        if (b.photos.length > limits.maxPhotosPerBien)
          add(
            `data.biens[${i}].photos`,
            `${limits.maxPhotosPerBien} photos maximum par bien`
          );
      });
    }
  }

  if (
    d.rendezVous &&
    (d.rendezVous.label || d.rendezVous.url) &&
    !limits.tabsAutorises.includes("RENDEZVOUS")
  )
    add(
      "data.rendezVous",
      "Le bloc rendez-vous n'est pas inclus dans cette formule"
    );

  if (d.entete) {
    if (
      d.entete.disposition &&
      !limits.headerLayouts.includes(
        d.entete.disposition.toUpperCase() as Disposition
      )
    )
      add(
        "data.entete.disposition",
        "Cette disposition d'entête n'est pas disponible avec cette formule"
      );
    if (
      d.entete.theme &&
      !limits.themes.includes(d.entete.theme.toUpperCase() as Theme)
    )
      add(
        "data.entete.theme",
        "Ce thème n'est pas disponible avec cette formule"
      );
  }

  let onglets = d.onglets;
  if (onglets) {
    const seen = new Set<string>();
    let texteCount = 0;
    onglets.forEach((o, i) => {
      const type = o.type.toUpperCase() as TabType;
      if (!limits.tabsAutorises.includes(type))
        add(
          `data.onglets[${i}].type`,
          `Le bloc « ${o.type} » n'est pas inclus dans cette formule`
        );
      if (type === "TEXTE") texteCount++;
      else if (seen.has(type))
        add(
          `data.onglets[${i}].type`,
          `Le bloc « ${o.type} » est présent plusieurs fois`
        );
      seen.add(type);
    });
    if (texteCount > limits.maxCustomTabs)
      add(
        "data.onglets",
        limits.maxCustomTabs === 0
          ? "Les onglets libres ne sont pas inclus dans cette formule"
          : `${limits.maxCustomTabs} onglets libres maximum`
      );

    // Nettoyage silencieux : on ignore ce que la formule ne permet pas.
    onglets = onglets.map(o => ({
      ...o,
      visible: limits.canHide ? o.visible : true,
      titre: limits.canRename ? o.titre : undefined,
      contenu: o.type === "texte" ? o.contenu : undefined,
    }));
  }

  if (v.length)
    throw unprocessable(
      "LIMITES_DEPASSEES",
      "Cette modification dépasse les droits de la formule",
      v
    );
  return { ...input, data: { ...d, ...(onglets ? { onglets } : {}) } };
}
