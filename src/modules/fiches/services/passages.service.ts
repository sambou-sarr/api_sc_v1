import { Prisma } from "../../../database/prisma/generated/prisma/client";
import { prisma } from "../../../database/prisma/prisma-client";
import { badRequest, conflict, notFound } from "../../../lib/httpError";
import type { AuthUser } from "../../../types/user";

export type PassageSource = "QR" | "NFC" | "DIRECT";
export type PassageGranularity = "day" | "month";

type PassageFilters = {
  granularity: PassageGranularity;
  date?: string;
  month?: string;
};

const emptyTotals = () => ({ qr: 0, nfc: 0, direct: 0, total: 0 });

function getRange(filters: PassageFilters) {
  if (filters.date && filters.month) {
    throw badRequest(
      "FILTRES_INCOMPATIBLES",
      "Choisissez une date ou un mois, pas les deux."
    );
  }

  if (filters.date) {
    const start = new Date(`${filters.date}T00:00:00.000Z`);
    if (
      Number.isNaN(start.getTime()) ||
      start.toISOString().slice(0, 10) !== filters.date
    ) {
      throw badRequest("DATE_INVALIDE", "La date demandée est invalide.");
    }
    return { start, end: new Date(start.getTime() + 86_400_000) };
  }

  if (filters.month) {
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(filters.month)) {
      throw badRequest(
        "MOIS_INVALIDE",
        "Le mois doit respecter le format AAAA-MM."
      );
    }
    const [year, month] = filters.month.split("-").map(Number);
    const start = new Date(Date.UTC(year, month - 1, 1));
    return { start, end: new Date(Date.UTC(year, month, 1)) };
  }

  return undefined;
}

export const PassageService = {
  async record(
    slug: string,
    source: PassageSource,
    idempotencyKey: string,
    user?: AuthUser
  ) {
    const fiche = await prisma.fiche.findUnique({
      where: { slug },
      select: { id: true, userId: true, statut: true },
    });
    if (!fiche || fiche.statut !== "ACTIVE") {
      return { recorded: false };
    }

    // La fiche ouverte par son propriétaire connecté ne génère aucun passage.
    // Cette règle est vérifiée côté serveur et ne dépend pas d'un paramètre d'URL.
    if (user && fiche.userId === user.id) {
      return { recorded: false };
    }

    const existing = await prisma.$queryRaw<
      Array<{ ficheId: number; source: string }>
    >(
      Prisma.sql`SELECT "ficheId", "source"::text AS source
        FROM "fiche_passages"
        WHERE "idempotencyKey" = ${idempotencyKey}
        LIMIT 1`
    );
    if (existing[0]) {
      if (existing[0].ficheId !== fiche.id || existing[0].source !== source) {
        throw conflict(
          "CLE_PASSAGE_REUTILISEE",
          "Cette clé de passage a déjà été utilisée."
        );
      }
      return { recorded: false };
    }

    return prisma.$transaction(async tx => {
      const inserted = await tx.$queryRaw<Array<{ id: number }>>(
        Prisma.sql`INSERT INTO "fiche_passages" ("ficheId", "source", "idempotencyKey")
          VALUES (${fiche.id}, ${source}::"FichePassageSource", ${idempotencyKey})
          ON CONFLICT ("idempotencyKey") DO NOTHING
          RETURNING "id"`
      );

      if (inserted.length === 0) {
        const duplicate = await tx.$queryRaw<
          Array<{ ficheId: number; source: string }>
        >(
          Prisma.sql`SELECT "ficheId", "source"::text AS source
            FROM "fiche_passages"
            WHERE "idempotencyKey" = ${idempotencyKey}
            LIMIT 1`
        );
        if (
          duplicate[0]?.ficheId === fiche.id &&
          duplicate[0]?.source === source
        ) {
          return { recorded: false };
        }
        throw conflict(
          "CLE_PASSAGE_REUTILISEE",
          "Cette clé de passage a déjà été utilisée."
        );
      }

      await tx.fiche.update({
        where: { id: fiche.id },
        data: { scansTotal: { increment: 1 } },
      });
      return { recorded: true };
    });
  },

  async stats(user: AuthUser, ficheId: number, filters: PassageFilters) {
    const fiche = await prisma.fiche.findUnique({
      where: { id: ficheId },
      select: { id: true, userId: true },
    });
    if (!fiche || (user.role !== "ADMIN" && fiche.userId !== user.id)) {
      throw notFound("Fiche introuvable");
    }

    const range = getRange(filters);
    const rangeClause = range
      ? Prisma.sql`AND "createdAt" >= ${range.start} AND "createdAt" < ${range.end}`
      : Prisma.empty;

    const totalsRows = await prisma.$queryRaw<
      Array<{ source: string; total: number }>
    >(
      Prisma.sql`
        SELECT "source"::text AS source, COUNT(*)::int AS total
        FROM "fiche_passages"
        WHERE "ficheId" = ${ficheId} ${rangeClause}
        GROUP BY "source"
      `
    );

    // Use a fixed SQL expression for both SELECT and GROUP BY.
    // Parameterizing the date_trunc field twice can produce distinct SQL
    // parameters, so PostgreSQL no longer recognizes the expressions as equal.
    const periodExpression =
      filters.granularity === "day"
        ? Prisma.sql`date_trunc('day', "createdAt")`
        : Prisma.sql`date_trunc('month', "createdAt")`;
    const format = filters.granularity === "day" ? "YYYY-MM-DD" : "YYYY-MM";
    const historyRows = await prisma.$queryRaw<
      Array<{ period: string; source: string; total: number }>
    >(
      Prisma.sql`
        SELECT
          to_char(${periodExpression}, ${format}) AS period,
          "source"::text AS source,
          COUNT(*)::int AS total
        FROM "fiche_passages"
        WHERE "ficheId" = ${ficheId} ${rangeClause}
        GROUP BY ${periodExpression}, "source"
        ORDER BY period ASC
      `
    );

    const totals = emptyTotals();
    for (const row of totalsRows) {
      if (row.source === "QR") totals.qr = row.total;
      if (row.source === "NFC") totals.nfc = row.total;
      if (row.source === "DIRECT") totals.direct = row.total;
    }
    totals.total = totals.qr + totals.nfc + totals.direct;

    const periods = new Map<string, ReturnType<typeof emptyTotals>>();
    for (const row of historyRows) {
      const value = periods.get(row.period) ?? emptyTotals();
      if (row.source === "QR") value.qr = row.total;
      if (row.source === "NFC") value.nfc = row.total;
      if (row.source === "DIRECT") value.direct = row.total;
      value.total = value.qr + value.nfc + value.direct;
      periods.set(row.period, value);
    }

    return {
      ficheId,
      granularity: filters.granularity,
      filters: { date: filters.date ?? null, month: filters.month ?? null },
      totals,
      history: [...periods.entries()].map(([period, values]) => ({
        period,
        ...values,
      })),
    };
  },
};
