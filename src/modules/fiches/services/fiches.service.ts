import { randomBytes } from "crypto";
import { env } from "../../../config/env";
import type {
  Disposition,
  PremierBouton,
  Prisma,
  Secteur,
  TabType,
  Taille,
  Theme,
} from "../../../database/prisma/generated/prisma/client";
import { prisma } from "../../../database/prisma/prisma-client";
import {
  HttpError,
  conflict,
  forbidden,
  notFound,
} from "../../../lib/httpError";
import { logger } from "../../../lib/logger";
import { normalizeMediaReferences } from "../../../lib/media";
import { AuthUser } from "../../../types/user";
import { MediaService } from "../../media/media.service";
import { collectStoredMediaKeys } from "../../media/media.validation";
import {
  getEffectiveSubscription,
  type EffectiveSubscription,
} from "../../subscriptions/subscriptions.service";
import { ficheInclude, toFicheDto, type FicheFull } from "../fiches.dto";
import { enforcePlanLimits } from "../fiches.limits";
import {
  JOURS,
  type CreateFicheInput,
  type UpdateFicheInput,
} from "../fiches.schemas";

const isAdmin = (u: AuthUser) => u.role === "ADMIN";
const up = <T extends string>(v: string) => v.toUpperCase() as T;
const nullIfEmpty = (v: string | undefined) =>
  v === undefined ? undefined : v === "" ? null : v;

// Un client ne voit que ses fiches. Pour les autres : « introuvable » (on ne révèle pas l'existence).
function assertAccess(user: AuthUser, fiche: { userId: number | null }) {
  if (!isAdmin(user) && fiche.userId !== user.id)
    throw notFound("Fiche introuvable");
}

export const FicheService = {
  listFiches: async (user: AuthUser) => {
    const fiches = await prisma.fiche.findMany({
      where: isAdmin(user) ? {} : { userId: user.id },
      include: ficheInclude,
      orderBy: { createdAt: "desc" },
      take: 200,
    });
    const subs = await effectiveByFiche(fiches.map(f => f.id));
    return fiches.map(f => toFicheDto(f, subs.get(f.id) ?? null));
  },

  // Create fiche
  createFiche: async (user: AuthUser, input: CreateFicheInput) => {
    if (!isAdmin(user)) {
      const count = await prisma.fiche.count({ where: { userId: user.id } });
      if (count >= env.MAX_FICHES_PER_USER) {

        console.log(input)
      /** Check formule , 
       * isEssentiel ? call subscrption
       */


        // Pay for a new emplacement
        throw forbidden(
          "LIMITE_FICHES",
          `Tu ne peux pas créer plus de ${env.MAX_FICHES_PER_USER} fiches`
        );
      }

    }

    const slug = await uniqueSlug(
      slugify(`${input.prenom} ${input.nom ?? ""}`)
    );
    const essentielle = await prisma.plan.findUnique({
      where: { type: "ESSENTIELLE" },
    });
    if (!essentielle)
      throw new HttpError(
        500,
        "SEED_MANQUANT",
        "Les formules ne sont pas initialisées (npm run prisma:seed)"
      );

    const fiche = await prisma.fiche.create({
      data: {
        slug,
        userId: user.id,
        prenom: input.prenom,
        nom: input.nom ?? "",
        fonction: input.fonction,
        entreprise: input.entreprise,
        telephone: input.telephone,
        whatsapp: input.whatsapp,
        secteur: input.secteur ? up<Secteur>(input.secteur) : undefined,
        enLigneSeule: true, // badge « Créée gratuitement avec Support Connecté »
        subscriptions: {
          create: {
            planId: essentielle.id,
            status: "ACTIVE",
            endsAt: null,
            amountFcfa: 0,
          },
        },
      },
      include: ficheInclude,
    });
    logger.info("Fiche created", { ficheId: fiche.id, userId: user.id });
    return dtoFor(fiche);
  },

  getFiche: async (user: AuthUser, id: number) => {
    const fiche = await loadFull(id);
    if (!fiche) throw notFound("Fiche introuvable");
    assertAccess(user, fiche);
    return dtoFor(fiche);
  },

  // ───────── Lecture ─────────

  // Page publique (scan NFC / QR). Ne compte PAS de passage : le comptage doit être fait ailleurs, de façon fiable.
  getPublicFiche: async (slug: string) => {
    const fiche = await prisma.fiche.findUnique({
      where: { slug },
      include: ficheInclude,
    });
    if (!fiche) throw notFound("Fiche introuvable");
    if (fiche.statut === "SUSPENDUE")
      throw new HttpError(
        410,
        "FICHE_INDISPONIBLE",
        "Cette fiche est momentanément indisponible"
      );
    return dtoFor(fiche);
  },

  // ───────── Mise à jour (cœur de la sécurité) ─────────

  updateFiche: async (
    user: AuthUser,
    id: number,
    rawInput: UpdateFicheInput
  ) => {
    const fiche = await prisma.fiche.findUnique({ where: { id } });
    if (!fiche) throw notFound("Fiche introuvable");
    assertAccess(user, fiche);

    if (!isAdmin(user)) {
      if (fiche.statut === "SUSPENDUE")
        throw forbidden(
          "FICHE_SUSPENDUE",
          "Cette fiche est suspendue : modification impossible"
        );
      if (env.REQUIRE_EMAIL_VERIFICATION && !user.emailVerified)
        throw forbidden(
          "EMAIL_NON_VERIFIE",
          "Confirme ton adresse e-mail avant de modifier ta fiche"
        );
    }

    const sub = await getEffectiveSubscription(id);
    if (!sub?.plan.limits)
      throw forbidden(
        "ABONNEMENT_EXPIRE",
        "L'abonnement de cette fiche a expiré : la modification est bloquée"
      );

    const input = enforcePlanLimits(
      sub.plan.limits,
      normalizeMediaReferences(rawInput)
    ); // 422 si dépassement
    const previousSnapshot = await loadFull(id);
    const d = input.data;
    const baseVersion = rawInput.baseUpdatedAt
      ? new Date(rawInput.baseUpdatedAt)
      : null;

    await prisma.$transaction(
      async tx => {
        const scalar: Prisma.FicheUpdateInput = {
          prenom: input.prenom,
          nom: input.nom,
          fonction: nullIfEmpty(input.fonction),
          entreprise: nullIfEmpty(input.entreprise),
          photo: nullIfEmpty(input.photo),
          logo: nullIfEmpty(input.logo),
          telephone: nullIfEmpty(input.telephone),
          whatsapp: nullIfEmpty(input.whatsapp),
          email: nullIfEmpty(input.email),
          site: nullIfEmpty(input.site),
          adresse: nullIfEmpty(input.adresse),
          googlePlaceId: nullIfEmpty(input.googlePlaceId),
          secteur: d?.secteur ? up<Secteur>(d.secteur) : undefined,
          premierBouton: d?.premierBouton
            ? up<PremierBouton>(d.premierBouton)
            : undefined,
          messageWhatsapp: nullIfEmpty(d?.messageWhatsapp),
          presentation: nullIfEmpty(d?.presentation),
          rdvLabel: d?.rendezVous ? nullIfEmpty(d.rendezVous.label) : undefined,
          rdvUrl: d?.rendezVous ? nullIfEmpty(d.rendezVous.url) : undefined,
          enteteDisposition: d?.entete?.disposition
            ? up<Disposition>(d.entete.disposition)
            : undefined,
          enteteTaille: d?.entete?.taille
            ? up<Taille>(d.entete.taille)
            : undefined,
          enteteTheme: d?.entete?.theme ? up<Theme>(d.entete.theme) : undefined,
          enteteCouverture: nullIfEmpty(d?.entete?.couverture),
        };
        // Écriture conditionnelle : si la fiche a changé depuis le chargement de l'éditeur (autre onglet, autre
        // appareil, admin), on n'écrase pas. Le test et l'écriture sont dans la même requête SQL : pas de course.
        const written = await tx.fiche.updateMany({
          where: { id, ...(baseVersion ? { updatedAt: baseVersion } : {}) },
          data: { ...scalar, updatedAt: new Date() },
        });
        if (written.count === 0)
          throw conflict(
            "CONFLIT_VERSION",
            "Cette fiche a été modifiée ailleurs depuis son ouverture. Rechargez-la pour voir la dernière version."
          );

        // Règle : une liste fournie REMPLACE l'existante ; une liste absente n'est pas touchée.
        if (d?.reseauxSociaux) {
          await tx.ficheReseau.deleteMany({ where: { ficheId: id } });
          await tx.ficheReseau.createMany({
            data: d.reseauxSociaux.map((r, i) => ({
              ficheId: id,
              label: r.label,
              url: r.url,
              position: i,
            })),
          });
        }
        if (d?.liens) {
          await tx.ficheLien.deleteMany({ where: { ficheId: id } });
          await tx.ficheLien.createMany({
            data: d.liens.map((l, i) => ({
              ficheId: id,
              label: l.label,
              url: l.url,
              position: i,
            })),
          });
        }
        if (d?.horaires) {
          const byDay = new Map(
            d.horaires.map(h => [JOURS.indexOf(h.jour), h.horaire])
          ); // un seul horaire par jour
          await tx.ficheHoraire.deleteMany({ where: { ficheId: id } });
          await tx.ficheHoraire.createMany({
            data: [...byDay].map(([jour, horaire]) => ({
              ficheId: id,
              jour,
              horaire,
            })),
          });
        }
        if (d?.galerie) {
          await tx.ficheMedia.deleteMany({ where: { ficheId: id } });
          await tx.ficheMedia.createMany({
            data: d.galerie.map((m, i) => ({
              ficheId: id,
              type: up<"IMAGE" | "VIDEO">(m.type),
              url: m.url,
              alt: m.alt || null,
              position: i,
            })),
          });
        }
        if (d?.onglets) {
          await tx.ficheOnglet.deleteMany({ where: { ficheId: id } });
          await tx.ficheOnglet.createMany({
            data: d.onglets.map((o, i) => ({
              ficheId: id,
              type: up<TabType>(o.type),
              titre: o.titre || null,
              contenu: o.contenu || null,
              visible: o.visible,
              position: i,
            })),
          });
        }
        if (d?.sections) {
          await tx.catalogueSection.deleteMany({ where: { ficheId: id } }); // supprime aussi les articles (cascade)
          for (const [i, sec] of d.sections.entries()) {
            await tx.catalogueSection.create({
              data: {
                ficheId: id,
                titre: sec.titre,
                position: i,
                articles: {
                  create: sec.articles.map((a, j) => ({
                    nom: a.nom,
                    description: a.description || null,
                    photo: a.photo || null,
                    prix: a.prix ?? null,
                    badge: a.badge || null,
                    position: j,
                  })),
                },
              },
            });
          }
        }
        if (d?.menu) {
          await tx.menuSection.deleteMany({ where: { ficheId: id } });
          for (const [i, sec] of d.menu.sections.entries()) {
            await tx.menuSection.create({
              data: {
                ficheId: id,
                titre: sec.titre,
                position: i,
                plats: {
                  create: sec.plats.map((p, j) => ({
                    nom: p.nom,
                    prix: p.prix ?? null,
                    description: p.description || null,
                    image: p.image || null,
                    video: p.video || null,
                    videoWebm: p.videoWebm || null,
                    badge: p.badge || null,
                    position: j,
                  })),
                },
              },
            });
          }
        }
        if (d?.biens) {
          await tx.bien.deleteMany({ where: { ficheId: id } });
          for (const [i, b] of d.biens.entries()) {
            await tx.bien.create({
              data: {
                ficheId: id,
                titre: b.titre,
                type: up<"VENTE" | "LOCATION">(b.type),
                prix: b.prix ?? null,
                periode: b.periode || null,
                ville: b.ville || null,
                surface: b.surface ?? null,
                terrain: b.terrain ?? null,
                chambres: b.chambres ?? null,
                sdb: b.sdb ?? null,
                atouts: b.atouts,
                description: b.description || null,
                position: i,
                photos: {
                  create: b.photos.map((url, j) => ({ url, position: j })),
                },
              },
            });
          }
        }
      },
      { timeout: 20_000 }
    );

    const updated = await loadFull(id);
    if (previousSnapshot && updated) {
      const previousKeys = collectStoredMediaKeys(previousSnapshot, id);
      const currentKeys = collectStoredMediaKeys(updated, id);
      const removedKeys = [...previousKeys].filter(
        key => !currentKeys.has(key)
      );
      for (const key of removedKeys) {
        try {
          await MediaService.deleteStoredMedia(id, key);
        } catch (error) {
          // La sauvegarde est déjà validée : une erreur de nettoyage ne doit pas la faire échouer.
          logger.warn("Removed fiche media could not be deleted from storage", {
            ficheId: id,
            key,
            error: error instanceof Error ? error.message : String(error),
          });
        }
      }
    }
    logger.info("Fiche updated", { ficheId: id, userId: user.id });
    return toFicheDto(updated!, sub);
  },
};

async function effectiveByFiche(ids: number[]) {
  const rows = await prisma.subscription.findMany({
    where: {
      ficheId: { in: ids },
      status: "ACTIVE",
      OR: [{ endsAt: null }, { endsAt: { gt: new Date() } }],
    },
    orderBy: { startsAt: "desc" },
    include: { plan: { include: { limits: true } } },
  });
  const map = new Map<number, EffectiveSubscription>();
  for (const r of rows) if (!map.has(r.ficheId)) map.set(r.ficheId, r);
  return map;
}

const loadFull = (id: number) =>
  prisma.fiche.findUnique({ where: { id }, include: ficheInclude });

async function dtoFor(fiche: FicheFull) {
  return toFicheDto(fiche, await getEffectiveSubscription(fiche.id));
}

// ───────── Création (inscription libre : fiche gratuite Essentielle) ─────────

const slugify = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);

async function uniqueSlug(base: string) {
  for (let i = 0; i < 5; i++) {
    const slug = `${base || "fiche"}-${randomBytes(2).toString("hex")}`;
    if (
      !(await prisma.fiche.findUnique({
        where: { slug },
        select: { id: true },
      }))
    )
      return slug;
  }
  throw new HttpError(
    500,
    "SLUG_INDISPONIBLE",
    "Impossible de générer une adresse unique, réessaie"
  );
}
