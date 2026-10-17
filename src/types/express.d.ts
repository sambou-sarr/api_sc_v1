import type { Role } from "../database/prisma/generated/prisma/client";

declare global {
  namespace Express {
    interface Request {
      user?: { id: number; role: Role; emailVerified: boolean };
    }
  }
}

export {};
