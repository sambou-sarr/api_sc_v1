import { randomBytes } from "crypto";
import type {
  PlanType,
  Prisma,
  Role,
  Secteur,
  StatutFiche,
} from "../../database/prisma/generated/prisma/client";
import { prisma } from "../../database/prisma/prisma-client";
import { conflict, notFound, unprocessable } from "../../lib/httpError";
import { ficheInclude, toFicheDto } from "../fiches/fiches.dto";
import {
  activateSubscription,
  getEffectiveSubscription,
} from "../subscriptions/subscriptions.service";
import type {
  CreateFicheInput,
  ListFichesQuery,
  ListUsersQuery,
  PatchFicheInput,
  SubscriptionInput,
} from "./admin.schemas";

// ═══════════════════════ Petits outils ═══════════════════════

const lower = (v: string) => v.toLowerCase();
// "pro" (front) -> "PRO" (base)
const upper = <T extends string>(v: string) => v.toUpperCase() as T;
const JOUR_MS = 24 * 60 * 60 * 1000;

const addMonths = (d: Date, n: number) => {
  const r = new Date(d);
  r.setMonth(r.getMonth() + n);
  return r;
};

// « Abonnement valable » = ACTIVE et pas encore arrivé à échéance.
// Équivalent d'un scope Eloquent : on l'écrit une fois, on le réutilise partout.
const abonnementValable = (now: Date): Prisma.SubscriptionWhereInput => ({
  status: "ACTIVE",
  OR: [{ endsAt: null }, { endsAt: { gt: now } }],
});

// Conditions sur les fiches, réutilisées par la liste ET par les statistiques.
// subscriptions: { some: ... } = whereHas('subscriptions', ...) en Laravel
const aLaFormule = (now: Date, type: PlanType): Prisma.FicheWhereInput => ({
  subscriptions: { some: { ...abonnementValable(now), plan: { type } } },
});
// NOT some = whereDoesntHave(...)
const estExpiree = (now: Date): Prisma.FicheWhereInput => ({
  NOT: { subscriptions: { some: abonnementValable(now) } },
});
const expireBientot = (now: Date): Prisma.FicheWhereInput => ({
  subscriptions: {
    some: {
      status: "ACTIVE",
      endsAt: { gt: now, lte: new Date(now.getTime() + 30 * JOUR_MS) },
    },
  },
});

// Ce qu'on montre d'un propriétaire : jamais le mot de passe.
const proprietaireSelect = {
  id: true,
  email: true,
  nom: true,
} satisfies Prisma.UserSelect;

// ───────── Génération de slug et de code de carte ─────────

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
    const pris = await prisma.fiche.findUnique({
      where: { slug },
      select: { id: true },
    });
    if (!pris) return slug;
  }
  throw conflict("SLUG_INDISPONIBLE", "Impossible de générer un slug unique");
}

// 32 caractères, sans 0/O/1/I pour éviter les confusions quand on lit le code sur une carte.
const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

function randomClaimCode() {
  let s = "";
  for (const byte of randomBytes(8)) s += CODE_ALPHABET[byte % 32];
  return `${s.slice(0, 4)}-${s.slice(4)}`; // ex. K7QM-2XPA
}

async function uniqueClaimCode() {
  for (let i = 0; i < 5; i++) {
    const claimCode = randomClaimCode();
    const pris = await prisma.fiche.findUnique({
      where: { claimCode },
      select: { id: true },
    });
    if (!pris) return claimCode;
  }
  throw conflict("CODE_INDISPONIBLE", "Impossible de générer un code unique");
}

// ───────── Vérifications ─────────

// Équivalent de Fiche::findOrFail($id)
async function assertFicheExists(id: number) {
  const fiche = await prisma.fiche.findUnique({
    where: { id },
    select: { id: true },
  });
  if (!fiche) throw notFound("Fiche introuvable");
}

async function assertUserExists(userId: number) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true },
  });
  if (!user)
    throw unprocessable(
      "PROPRIETAIRE_INTROUVABLE",
      "Aucun compte avec cet identifiant"
    );
}

// ═══════════════════════ Le service ═══════════════════════

export const AdminService = {
  // ───────── Tableau de bord ─────────
  stats: async () => {
    const now = new Date();
    const il_y_a_30_jours = new Date(now.getTime() - 30 * JOUR_MS);

    // Toutes les requêtes partent en même temps (Promise.all) au lieu de s'attendre une par une.
    const [
      total,
      suspendues,
      expirees,
      bientot,
      sansProprietaire,
      cartesALier,
      nouvelles,
      essentielle,
      pro,
      signature,
      scans,
      clients,
    ] = await Promise.all([
      prisma.fiche.count(),
      prisma.fiche.count({ where: { statut: "SUSPENDUE" } }),
      prisma.fiche.count({ where: estExpiree(now) }),
      prisma.fiche.count({ where: expireBientot(now) }),
      prisma.fiche.count({ where: { userId: null } }),
      prisma.fiche.count({ where: { claimCode: { not: null } } }),
      prisma.fiche.count({ where: { createdAt: { gte: il_y_a_30_jours } } }),
      prisma.fiche.count({ where: aLaFormule(now, "ESSENTIELLE") }),
      prisma.fiche.count({ where: aLaFormule(now, "PRO") }),
      prisma.fiche.count({ where: aLaFormule(now, "SIGNATURE") }),
      prisma.fiche.aggregate({ _sum: { scansTotal: true } }),
      prisma.user.count({ where: { role: "CLIENT" } }),
    ]);

    return {
      fiches: {
        total,
        suspendues,
        expirees,
        expirentBientot: bientot, // dans les 30 jours
        sansProprietaire,
        cartesALier, // codes de carte pas encore utilisés
        nouvellesSur30Jours: nouvelles,
      },
      formules: { essentielle, pro, signature }, // abonnements valables uniquement
      scansTotal: scans._sum.scansTotal ?? 0,
      clients,
    };
  },

  // ───────── Liste paginée des fiches (légère : sans catalogue, menu, biens...) ─────────
  listFiches: async (q: ListFichesQuery) => {
    const now = new Date();

    // On empile les conditions puis on les combine avec AND
    // (comme enchaîner des ->where() sur une requête Eloquent).
    const conditions: Prisma.FicheWhereInput[] = [];

    if (q.search) {
      const contient = { contains: q.search, mode: "insensitive" as const };
      conditions.push({
        OR: [
          { slug: contient },
          { prenom: contient },
          { nom: contient },
          { entreprise: contient },
          { telephone: contient },
          { email: contient },
          { user: { email: contient } },
        ],
      });
    }
    if (q.statut) conditions.push({ statut: upper<StatutFiche>(q.statut) });
    if (q.formule) conditions.push(aLaFormule(now, upper<PlanType>(q.formule)));
    if (q.expiration === "expiree") conditions.push(estExpiree(now));
    if (q.expiration === "bientot") conditions.push(expireBientot(now));
    if (q.userId) conditions.push({ userId: q.userId });
    if (q.carteALier === "true") conditions.push({ claimCode: { not: null } });
    if (q.carteALier === "false") conditions.push({ claimCode: null });

    const where: Prisma.FicheWhereInput = conditions.length
      ? { AND: conditions }
      : {};

    const triPrincipal: Prisma.FicheOrderByWithRelationInput =
      q.tri === "scans"
        ? { scansTotal: "desc" }
        : q.tri === "nom"
          ? { prenom: "asc" }
          : { createdAt: "desc" };

    // Deux requêtes dans une même transaction : les lignes de la page + le total.
    const [fiches, total] = await prisma.$transaction([
      prisma.fiche.findMany({
        where,
        select: {
          id: true,
          slug: true,
          prenom: true,
          nom: true,
          entreprise: true,
          statut: true,
          scansTotal: true,
          createdAt: true,
          claimCode: true,
          user: { select: proprietaireSelect }, // ->with('user')
          subscriptions: {
            where: abonnementValable(now),
            orderBy: { startsAt: "desc" },
            take: 1,
            select: { endsAt: true, plan: { select: { type: true } } },
          },
        },
        // le 2e tri (id) garde l'ordre stable d'une page à l'autre
        orderBy: [triPrincipal, { id: "desc" }],
        skip: (q.page - 1) * q.limit, // OFFSET
        take: q.limit, // LIMIT
      }),
      prisma.fiche.count({ where }),
    ]);

    return {
      fiches: fiches.map(f => {
        const abo = f.subscriptions[0] ?? null;
        return {
          id: f.id,
          slug: f.slug,
          nom: `${f.prenom} ${f.nom}`.trim(),
          entreprise: f.entreprise ?? "",
          statut: lower(f.statut),
          // même repli que toFicheDto : sans abonnement valable => « essentielle » + expirée
          formule: abo ? lower(abo.plan.type) : "essentielle",
          expiree: abo === null,
          dateEcheance: abo?.endsAt
            ? abo.endsAt.toISOString().slice(0, 10)
            : null,
          scansTotal: f.scansTotal,
          createdAt: f.createdAt,
          proprietaire: f.user, // null tant que personne n'a rattaché la fiche
          carteALier: f.claimCode !== null,
        };
      }),
      pagination: {
        page: q.page,
        limit: q.limit,
        total,
        totalPages: Math.max(1, Math.ceil(total / q.limit)),
      },
    };
  },

  // ───────── Détail d'une fiche ─────────
  getFiche: async (id: number) => {
    const fiche = await prisma.fiche.findUnique({
      where: { id },
      include: {
        ...ficheInclude, // tout le contenu
        user: { select: proprietaireSelect },
      },
    });
    if (!fiche) throw notFound("Fiche introuvable");

    const [effective, abonnements] = await Promise.all([
      getEffectiveSubscription(id),
      prisma.subscription.findMany({
        where: { ficheId: id },
        orderBy: { createdAt: "desc" },
        include: { plan: { select: { type: true, nom: true } } },
      }),
    ]);

    return {
      fiche: toFicheDto(fiche, effective),
      proprietaire: fiche.user,
      claimCode: fiche.claimCode, // visible seulement côté admin
      abonnements: abonnements.map(a => ({
        id: a.id,
        formule: lower(a.plan.type),
        statut: lower(a.status),
        debut: a.startsAt,
        fin: a.endsAt,
        montantFcfa: a.amountFcfa,
        referencePaiement: a.paymentRef,
        annuleLe: a.canceledAt,
      })),
    };
  },

  // ───────── Création d'une fiche pour un client ─────────
  createFiche: async (input: CreateFicheInput) => {
    if (input.userId !== undefined) await assertUserExists(input.userId);

    const plan = await prisma.plan.findUnique({
      where: { type: upper<PlanType>(input.formule) },
    });
    if (!plan || !plan.actif)
      throw unprocessable(
        "FORMULE_INDISPONIBLE",
        "Formule introuvable ou désactivée (les formules sont-elles initialisées ?)"
      );

    let slug: string;
    if (input.slug) {
      const pris = await prisma.fiche.findUnique({
        where: { slug: input.slug },
        select: { id: true },
      });
      if (pris) throw conflict("SLUG_PRIS", "Ce slug est déjà utilisé");
      slug = input.slug;
    } else {
      slug = await uniqueSlug(slugify(`${input.prenom} ${input.nom ?? ""}`));
    }

    // Pas de propriétaire = on génère un code à imprimer sur la carte,
    // le client le saisira pour rattacher sa fiche à son compte.
    const claimCode =
      input.userId === undefined ? await uniqueClaimCode() : null;

    const now = new Date();
    const endsAt =
      input.endsAt !== undefined
        ? input.endsAt === null
          ? null
          : new Date(input.endsAt)
        : plan.dureeMois
          ? addMonths(now, plan.dureeMois)
          : null;

    // La fiche et son abonnement sont créés ensemble (une seule opération).
    const fiche = await prisma.fiche.create({
      data: {
        slug,
        userId: input.userId ?? null,
        claimCode,
        statut: "ACTIVE",
        prenom: input.prenom,
        nom: input.nom ?? "",
        fonction: input.fonction,
        entreprise: input.entreprise,
        telephone: input.telephone,
        whatsapp: input.whatsapp,
        email: input.email,
        secteur: input.secteur ? upper<Secteur>(input.secteur) : undefined,
        enLigneSeule: input.enLigneSeule,
        subscriptions: {
          create: {
            planId: plan.id,
            status: "ACTIVE",
            startsAt: now,
            endsAt,
            amountFcfa: input.amountFcfa ?? plan.prixFcfa,
            paymentRef: input.paymentRef ?? null,
          },
        },
      },
      include: ficheInclude,
    });

    return {
      fiche: toFicheDto(fiche, await getEffectiveSubscription(fiche.id)),
      claimCode,
    };
  },

  // ───────── Modifier slug / statut / propriétaire ─────────
  updateFiche: async (id: number, input: PatchFicheInput) => {
    await assertFicheExists(id);

    if (input.slug !== undefined) {
      const pris = await prisma.fiche.findFirst({
        where: { slug: input.slug, NOT: { id } },
        select: { id: true },
      });
      if (pris)
        throw conflict("SLUG_PRIS", "Ce slug est déjà utilisé par une autre fiche");
    }
    if (input.userId) await assertUserExists(input.userId);

    const fiche = await prisma.fiche.update({
      where: { id },
      data: {
        slug: input.slug,
        userId: input.userId, // undefined = inchangé, null = on retire le propriétaire
        // un propriétaire attribué à la main rend le code de carte inutile
        claimCode: input.userId ? null : undefined,
        statut: input.statut ? upper<StatutFiche>(input.statut) : undefined,
      },
      include: ficheInclude,
    });

    return toFicheDto(fiche, await getEffectiveSubscription(id));
  },

  // ───────── Supprimer une fiche (définitif) ─────────
  // Contenus, médias et abonnements partent avec elle (onDelete: Cascade dans le schéma).
  deleteFiche: async (id: number, confirmer: string) => {
    const fiche = await prisma.fiche.findUnique({
      where: { id },
      select: { slug: true },
    });
    if (!fiche) throw notFound("Fiche introuvable");
    if (confirmer !== fiche.slug)
      throw unprocessable(
        "CONFIRMATION_INVALIDE",
        "Pour supprimer, renvoie le slug exact de la fiche dans ?confirmer="
      );

    await prisma.fiche.delete({ where: { id } });
  },

  // ───────── Code de rattachement de la carte ─────────
  // Génère un code (ou en remplace un existant) pour qu'un client rattache cette fiche.
  generateClaimCode: async (id: number) => {
    await assertFicheExists(id);
    const claimCode = await uniqueClaimCode();
    await prisma.fiche.update({ where: { id }, data: { claimCode } });
    return { claimCode };
  },

  // ───────── Abonnements ─────────

  // Activer une formule (après un paiement validé). L'ancien abonnement actif est annulé.
  activateSubscription: async (id: number, input: SubscriptionInput) => {
    await assertFicheExists(id);

    return activateSubscription({
      ficheId: id,
      planType: upper<PlanType>(input.plan),
      // undefined = durée de la formule, null = sans échéance, sinon la date envoyée
      endsAt:
        input.endsAt === undefined
          ? undefined
          : input.endsAt === null
            ? null
            : new Date(input.endsAt),
      amountFcfa: input.amountFcfa,
      paymentRef: input.paymentRef,
    });
  },

  // Annuler un abonnement. La fiche apparaîtra « expirée » tant qu'on n'en active pas un autre.
  cancelSubscription: async (ficheId: number, subId: number) => {
    const sub = await prisma.subscription.findFirst({
      where: { id: subId, ficheId }, // l'abonnement doit appartenir à CETTE fiche
    });
    if (!sub) throw notFound("Abonnement introuvable pour cette fiche");
    if (sub.status !== "ACTIVE" && sub.status !== "PENDING")
      throw conflict(
        "ABONNEMENT_TERMINE",
        "Cet abonnement est déjà terminé ou annulé"
      );

    return prisma.subscription.update({
      where: { id: subId },
      data: { status: "CANCELED", canceledAt: new Date() },
    });
  },

  // ───────── Utilisateurs (pour choisir un propriétaire) ─────────
  listUsers: async (q: ListUsersQuery) => {
    const where: Prisma.UserWhereInput = {};
    if (q.search) {
      const contient = { contains: q.search, mode: "insensitive" as const };
      where.OR = [{ email: contient }, { nom: contient }];
    }
    if (q.role) where.role = upper<Role>(q.role);

    const [users, total] = await prisma.$transaction([
      prisma.user.findMany({
        where,
        // select = on choisit les colonnes : passwordHash n'en fait pas partie
        select: {
          id: true,
          email: true,
          nom: true,
          role: true,
          emailVerifiedAt: true,
          createdAt: true,
          _count: { select: { fiches: true } }, // withCount('fiches')
        },
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        skip: (q.page - 1) * q.limit,
        take: q.limit,
      }),
      prisma.user.count({ where }),
    ]);

    return {
      users: users.map(u => ({
        id: u.id,
        email: u.email,
        nom: u.nom,
        role: lower(u.role),
        emailVerifie: u.emailVerifiedAt !== null,
        createdAt: u.createdAt,
        nbFiches: u._count.fiches,
      })),
      pagination: {
        page: q.page,
        limit: q.limit,
        total,
        totalPages: Math.max(1, Math.ceil(total / q.limit)),
      },
    };
  },
};
