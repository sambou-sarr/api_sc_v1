import type { Plan, PlanLimit } from "../../database/prisma/generated/prisma/client";

const lower = <T extends string>(v: T) => v.toLowerCase();

/**
 * Droits de la formule, au format attendu par l'éditeur du front (type `Plan`, minuscules).
 * Source de vérité = table plan_limits : le front n'a plus à dupliquer les quotas en dur.
 */
export function toPlanCapabilities(
  plan: Pick<Plan, "nom" | "themeDefaut">,
  l: PlanLimit
) {
  return {
    label: plan.nom,
    theme: lower(plan.themeDefaut),
    tabs: l.tabsAutorises.map(lower),
    canReorder: l.canReorder,
    canHide: l.canHide,
    canAdd: l.canAdd,
    canRename: l.canRename,
    maxPresentation: l.maxPresentation,
    maxSocial: l.maxSocial,
    maxLinks: l.maxLinks,
    maxPhotos: l.maxPhotos,
    maxVideos: l.maxVideos,
    maxCustomTabs: l.maxCustomTabs,
    hasGoogleReview: l.hasGoogleReview,
    hasCatalog: l.hasCatalog,
    maxCatalogSections: l.maxCatalogSections,
    maxCatalogArticlesPerSection: l.maxCatalogArticlesPerSection,
    catalogPrices: l.catalogPrices,
    hasMenu: l.hasMenu,
    maxMenuSections: l.maxMenuSections,
    maxMenuItemsPerSection: l.maxMenuItemsPerSection,
    menuVideoPerItem: l.menuVideoPerItem,
    maxMenuVideoSeconds: l.maxMenuVideoSeconds,
    hasBiens: l.hasBiens,
    maxBiens: l.maxBiens,
    maxPhotosPerBien: l.maxPhotosPerBien,
    hasForm: l.hasForm,
    hasStats: l.hasStats,
    hasDashboard: l.hasDashboard,
    headerLayouts: l.headerLayouts.map(lower),
    themes: l.themes.map(lower),
  };
}
