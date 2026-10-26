import { z } from "zod";

const email = z.string().trim().max(160).email().or(z.literal("")).optional();
const optionalText = (max: number) => z.string().trim().max(max).optional();

const projetSchema = z.object({
  nom: optionalText(120),
  ville: optionalText(80),
  lots: z.number().int().positive().nullable().optional(),
  stade: z.enum(["avant-lancement", "chantier", "commercialisation", "livraison"]).optional(),
});

export const createLeadSchema = z.object({
  intent: z.enum(["devis", "demo", "question", "maquette"]),
  intentLabel: z.string().trim().min(1).max(200),
  products: z.array(z.string().trim().min(1).max(120)).max(50).default([]),
  sector: optionalText(100),
  name: z.string().trim().min(2).max(120),
  role: optionalText(120),
  company: optionalText(120),
  phone: optionalText(40),
  email,
  city: optionalText(80),
  prefer: optionalText(40),
  message: optionalText(4000),
  consent_marketing: z.boolean().default(false),
  consent_text: optionalText(500),
  consent_at: z.string().datetime().optional(),
  source: optionalText(80),
  page: optionalText(300),
  website: optionalText(300),
  pole: z.enum(["contenu", "impression", "digital", "ia", "immobilier"]).optional(),
  services: z.array(z.string().trim().min(1).max(100)).max(50).default([]),
  production: z.enum(["reel", "ia", "mixte", "indecis"]).optional(),
  delai: z.enum(["urgent", "mois", "trimestre", "libre"]).optional(),
  profil: z.enum(["promoteur", "agence", "proprietaire"]).optional(),
  projet: projetSchema.optional(),
  design: z.record(z.string(), z.unknown()).optional(),
}).strict();

export const listLeadsQuery = z.object({
  search: z.string().trim().min(1).max(100).optional(),
  status: z.enum(["NEW", "CONTACTED", "CLOSED"]).optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

export const leadIdParams = z.object({
  id: z.coerce.number().int().positive(),
});

export const updateLeadSchema = z.object({
  status: z.enum(["NEW", "CONTACTED", "CLOSED"]),
}).strict();

export type CreateLeadInput = z.infer<typeof createLeadSchema>;
export type ListLeadsQuery = z.infer<typeof listLeadsQuery>;
