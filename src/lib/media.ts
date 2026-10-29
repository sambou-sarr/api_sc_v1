import { env } from "../config/env";
import { UpdateFicheInput } from "../modules/fiches/fiches.schemas";

// Les URL de l'API ne sont jamais persistées : seule la référence relative /api/media/... est stockée.
export function normalizeMediaUrl(value: string | undefined) {
  if (!value) return value;
  const apiOrigin = env.SERVER.replace(/\/api\/?$/, "").replace(/\/$/, "");
  const prefix = `${apiOrigin}/api/media/`;
  return value.startsWith(prefix) ? value.slice(apiOrigin.length) : value;
}

export const s = (v: string | null | undefined) => v ?? ""; // le front attend '' plutôt que null
// Les références persistées restent relatives et indépendantes du fournisseur de stockage.
export const mediaUrl = (v: string | null | undefined) => {
  const value = s(v);
  if (!value.startsWith("/api/media/")) return value;
  const apiOrigin = env.SERVER.replace(/\/api\/?$/, "").replace(/\/$/, "");
  return `${apiOrigin}${value}`;
};


export function normalizeMediaReferences(
  input: UpdateFicheInput
): UpdateFicheInput {
  const d = input.data;
  return {
    ...input,
    photo: normalizeMediaUrl(input.photo),
    logo: normalizeMediaUrl(input.logo),
    ...(d
      ? {
          data: {
            ...d,
            galerie: d.galerie?.map(m => ({
              ...m,
              url: normalizeMediaUrl(m.url)!,
            })),
            sections: d.sections?.map(section => ({
              ...section,
              articles: section.articles.map(article => ({
                ...article,
                photo: normalizeMediaUrl(article.photo),
              })),
            })),
            menu: d.menu
              ? {
                  ...d.menu,
                  sections: d.menu.sections.map(section => ({
                    ...section,
                    plats: section.plats.map(plat => ({
                      ...plat,
                      image: normalizeMediaUrl(plat.image),
                      video: normalizeMediaUrl(plat.video),
                      videoWebm: normalizeMediaUrl(plat.videoWebm),
                    })),
                  })),
                }
              : undefined,
            biens: d.biens?.map(bien => ({
              ...bien,
              photos: bien.photos.map(photo => normalizeMediaUrl(photo)!),
            })),
            entete: d.entete
              ? {
                  ...d.entete,
                  couverture: normalizeMediaUrl(d.entete.couverture),
                }
              : undefined,
          },
        }
      : {}),
  };
}
