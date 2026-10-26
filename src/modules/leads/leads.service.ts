import type { Prisma } from "../../database/prisma/generated/prisma/client";
import { prisma } from "../../database/prisma/prisma-client";
import { notFound, unprocessable } from "../../lib/httpError";
import type { CreateLeadInput, ListLeadsQuery } from "./leads.schemas";

export const LeadsService = {
  async create(input: CreateLeadInput) {
    if (input.website) throw unprocessable("DEMANDE_INVALIDE", "Demande invalide");

    return prisma.leadRequest.create({
      data: {
        intent: input.intent,
        intentLabel: input.intentLabel,
        products: input.products,
        sector: input.sector,
        name: input.name,
        role: input.role,
        company: input.company,
        phone: input.phone,
        email: input.email || null,
        city: input.city,
        prefer: input.prefer,
        message: input.message,
        consentMarketing: input.consent_marketing,
        consentText: input.consent_text,
        consentAt: input.consent_at ? new Date(input.consent_at) : null,
        source: input.source || "site",
        page: input.page,
        pole: input.pole,
        services: input.services,
        production: input.production,
        delai: input.delai,
        profil: input.profil,
        projet: input.projet as Prisma.InputJsonValue | undefined,
        design: input.design as Prisma.InputJsonValue | undefined,
      },
      select: { id: true, createdAt: true },
    });
  },

  async list(query: ListLeadsQuery) {
    const where: Prisma.LeadRequestWhereInput = {
      ...(query.status ? { status: query.status } : {}),
      ...(query.search
        ? {
            OR: [
              { name: { contains: query.search, mode: "insensitive" } },
              { company: { contains: query.search, mode: "insensitive" } },
              { email: { contains: query.search, mode: "insensitive" } },
              { phone: { contains: query.search, mode: "insensitive" } },
              { intentLabel: { contains: query.search, mode: "insensitive" } },
            ],
          }
        : {}),
    };
    const [items, total] = await prisma.$transaction([
      prisma.leadRequest.findMany({
        where,
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        skip: (query.page - 1) * query.limit,
        take: query.limit,
      }),
      prisma.leadRequest.count({ where }),
    ]);
    return {
      items,
      pagination: {
        page: query.page,
        limit: query.limit,
        total,
        totalPages: Math.max(1, Math.ceil(total / query.limit)),
      },
    };
  },

  async updateStatus(id: number, status: "NEW" | "CONTACTED" | "CLOSED") {
    const result = await prisma.leadRequest.updateMany({
      where: { id },
      data: { status },
    });
    if (result.count === 0) throw notFound("Demande introuvable");
    return prisma.leadRequest.findUniqueOrThrow({ where: { id } });
  },
};
