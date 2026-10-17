import { z } from "zod";

// Même forme que le slug d'une fiche (voir admin.schemas.ts)
export const scanParams = z.object({
  slug: z
    .string()
    .trim()
    .regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, "slug invalide")
    .max(60),
});
