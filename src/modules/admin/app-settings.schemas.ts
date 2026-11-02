import { z } from "zod";

const socialLinks = z
  .object({
    instagram: z
      .string()
      .trim()
      .max(500)
      .refine(v => !v || /^https:\/\/\S+$/i.test(v), "Lien Instagram invalide"),
    facebook: z
      .string()
      .trim()
      .max(500)
      .refine(v => !v || /^https:\/\/\S+$/i.test(v), "Lien Facebook invalide"),
    linkedin: z
      .string()
      .trim()
      .max(500)
      .refine(v => !v || /^https:\/\/\S+$/i.test(v), "Lien LinkedIn invalide"),
  })
  .strict();

export const updateAppSettingsSchema = z
  .object({
    id: z.number().int().positive().optional(),
    platformName: z.string().trim().min(2).max(100),
    supportEmail: z.string().trim().email().max(254).or(z.literal("")),
    supportPhone: z.string().trim().max(40),
    socialLinks,
    maintenance: z.boolean(),
    updatedAt: z.string().datetime().optional(),
  })
  .strict();

export type UpdateAppSettingsInput = z.infer<typeof updateAppSettingsSchema>;
