import type { NextFunction, Request, Response } from "express";
import { afterEach, describe, expect, it, vi } from "vitest";
import { HttpError } from "../lib/httpError";
import { logger } from "../lib/logger";
import { errorHandler, rateLimitHandler } from "./errorHandler";

const request = {
  method: "POST",
  path: "/api/fiches",
  user: { id: 17 },
} as Request;

function response(headersSent = false) {
  return {
    locals: { requestId: "request-123" },
    headersSent,
    status: vi.fn().mockReturnThis(),
    json: vi.fn().mockReturnThis(),
  } as unknown as Response & {
    status: ReturnType<typeof vi.fn>;
    json: ReturnType<typeof vi.fn>;
  };
}

afterEach(() => vi.restoreAllMocks());

describe("errorHandler", () => {
  it("logs unknown technical errors and returns no internal details", () => {
    const log = vi.spyOn(logger, "error");
    const res = response();
    const error = new Error("postgres://internal-host/password");

    errorHandler(error, request, res, vi.fn() as NextFunction);

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({
      error: {
        code: "ERREUR_SERVEUR",
        message: "Une erreur technique est survenue. Réessayez plus tard.",
      },
    });
    expect(JSON.stringify(res.json.mock.calls)).not.toContain(
      "internal-host",
    );
    expect(log).toHaveBeenCalledWith(
      "Unhandled request error",
      expect.objectContaining({
        requestId: "request-123",
        error: expect.objectContaining({
          message: "postgres://internal-host/password",
        }),
      }),
    );
  });

  it("masque aussi les HttpError de catégorie serveur", () => {
    const res = response();
    const log = vi.spyOn(logger, "error");

    errorHandler(
      new HttpError(503, "DB_INDISPONIBLE", "Connexion PostgreSQL refusée"),
      request,
      res,
      vi.fn() as NextFunction,
    );

    expect(res.status).toHaveBeenCalledWith(503);
    expect(res.json).toHaveBeenCalledWith({
      error: {
        code: "ERREUR_SERVEUR",
        message: "Une erreur technique est survenue. Réessayez plus tard.",
      },
    });
    expect(log).toHaveBeenCalledWith(
      "Request failed with a server error",
      expect.objectContaining({ errorCode: "DB_INDISPONIBLE" }),
    );
  });

  it("conserve le message et les détails des erreurs métier contrôlées", () => {
    const res = response();

    errorHandler(
      new HttpError(422, "FICHE_INVALIDE", "Certains champs sont invalides", [
        { champ: "prenom", message: "Le prénom est obligatoire." },
      ]),
      request,
      res,
      vi.fn() as NextFunction,
    );

    expect(res.status).toHaveBeenCalledWith(422);
    expect(res.json).toHaveBeenCalledWith({
      error: {
        code: "FICHE_INVALIDE",
        message: "Certains champs sont invalides",
        details: [{ champ: "prenom", message: "Le prénom est obligatoire." }],
      },
    });
  });

  it.each([
    ["entity.parse.failed", 400, "CORPS_REQUETE_INVALIDE"],
    ["entity.too.large", 413, "REQUETE_TROP_VOLUMINEUSE"],
  ])("normalise les erreurs de corps %s", (type, status, code) => {
    const res = response();
    const error = Object.assign(new Error("parser internals"), { type });

    errorHandler(error, request, res, vi.fn() as NextFunction);

    expect(res.status).toHaveBeenCalledWith(status);
    expect(JSON.stringify(res.json.mock.calls)).not.toContain(
      "parser internals",
    );
    expect(res.json).toHaveBeenCalledWith({
      error: expect.objectContaining({ code }),
    });
  });

  it("transmet l'erreur à Express si la réponse a déjà commencé", () => {
    const next = vi.fn();
    const res = response(true);
    const error = new Error("stream failed");

    errorHandler(error, request, res, next);

    expect(next).toHaveBeenCalledWith(error);
    expect(res.status).not.toHaveBeenCalled();
  });
});

describe("rateLimitHandler", () => {
  it("renvoie une réponse JSON claire et journalise la requête", () => {
    const log = vi.spyOn(logger, "warn");
    const res = response();

    rateLimitHandler(request, res);

    expect(res.status).toHaveBeenCalledWith(429);
    expect(res.json).toHaveBeenCalledWith({
      error: {
        code: "TROP_DE_REQUETES",
        message: "Trop de requêtes. Réessayez dans quelques instants.",
      },
    });
    expect(log).toHaveBeenCalledWith(
      "Request rate limit exceeded",
      expect.objectContaining({ requestId: "request-123" }),
    );
  });
});
