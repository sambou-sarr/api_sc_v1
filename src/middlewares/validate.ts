import type { NextFunction, Request, Response } from "express";
import type { ZodTypeAny } from "zod";

type Schemas = { body?: ZodTypeAny; params?: ZodTypeAny; query?: ZodTypeAny };

// Valide (et nettoie) body / params / query avec zod. Les clés inconnues sont retirées.
export const validate =
  (schemas: Schemas) => (req: Request, _res: Response, next: NextFunction) => {
    try {
      if (schemas.body) req.body = schemas.body.parse(req.body);
      if (schemas.params)
        Object.assign(req.params, schemas.params.parse(req.params));
      if (schemas.query)
        Object.assign(req.query, schemas.query.parse(req.query));
      next();
    } catch (e) {
      next(e); // ZodError → 400 dans errorHandler
    }
  };
