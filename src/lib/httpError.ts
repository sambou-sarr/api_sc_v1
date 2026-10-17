export class HttpError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public details?: unknown
  ) {
    super(message);
  }
}

export const badRequest = (code: string, msg: string, details?: unknown) =>
  new HttpError(400, code, msg, details);

export const unauthorized = (msg = "Authentification requise") =>
  new HttpError(401, "NON_AUTHENTIFIE", msg);
export const forbidden = (code: string, msg: string) =>
  new HttpError(403, code, msg);
export const notFound = (msg = "Ressource introuvable") =>
  new HttpError(404, "INTROUVABLE", msg);
export const conflict = (code: string, msg: string) =>
  new HttpError(409, code, msg);
export const unprocessable = (code: string, msg: string, details?: unknown) =>
  new HttpError(422, code, msg, details);
