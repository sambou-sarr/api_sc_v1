import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  put: vi.fn(),
  get: vi.fn(),
  del: vi.fn(),
  optimize: vi.fn(),
}));

vi.mock("../../config/env", () => ({ env: { SERVER: "http://localhost:4000/api" } }));
vi.mock("../../infrastructure/storage/s3.storage", () => ({
  S3StorageProvider: class {
    put = mocks.put;
    get = mocks.get;
    delete = mocks.del;
  },
}));
vi.mock("./media.processor", () => ({ optimizeMedia: mocks.optimize, probeDurationSeconds: vi.fn() }));
vi.mock("../../database/prisma/prisma-client", () => ({ prisma: {} }));

import { CardImageService } from "./card-images.service";
import { mediaRouter } from "./media.routes";

const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(64)]);
const UUID = "0a1b2c3d-0000-4000-8000-000000000001";

beforeEach(() => {
  vi.clearAllMocks();
  mocks.put.mockResolvedValue(undefined);
  mocks.del.mockResolvedValue(undefined);
  mocks.optimize.mockResolvedValue({ body: Buffer.from("webp-optimise"), mime: "image/webp" });
});

describe("CardImageService.upload", () => {
  it("optimise l'image, la range sous card-models/ en WebP et renvoie l'adresse publique", async () => {
    const { url } = await CardImageService.upload(PNG, "image/png");
    expect(mocks.optimize).toHaveBeenCalledWith(PNG, "image/png");
    const call = mocks.put.mock.calls[0][0];
    expect(call.key).toMatch(/^card-models\/[0-9a-f-]{36}\.webp$/);
    expect(call).toMatchObject({ body: Buffer.from("webp-optimise"), contentType: "image/webp" });
    expect(url).toBe(`http://localhost:4000/api/media/cartes/${call.key.replace("card-models/", "")}`);
  });

  it("deux envois ne s'écrasent jamais (noms uniques)", async () => {
    await CardImageService.upload(PNG, "image/png");
    await CardImageService.upload(PNG, "image/png");
    expect(mocks.put.mock.calls[0][0].key).not.toBe(mocks.put.mock.calls[1][0].key);
  });

  it.each([
    ["fichier vide", Buffer.alloc(0), "image/png", "FICHIER_VIDE"],
    ["vidéo (images seulement)", Buffer.from("....ftypisom"), "video/mp4", "FORMAT_IMAGE_REQUIS"],
    ["format inconnu", PNG, "application/pdf", "FORMAT_MEDIA_INVALIDE"],
    ["contenu qui n'est pas un PNG malgré l'en-tête", Buffer.from("<html>pas une image</html>"), "image/png", expect.any(String)],
  ])("refuse : %s", async (_label, body, mime, code) => {
    await expect(CardImageService.upload(body as Buffer, mime)).rejects.toMatchObject({ status: 422, code });
    expect(mocks.put).not.toHaveBeenCalled();
  });

  it("refuse une image de plus de 12 Mo", async () => {
    const big = Buffer.concat([PNG, Buffer.alloc(12 * 1024 * 1024)]);
    await expect(CardImageService.upload(big, "image/png")).rejects.toMatchObject({ code: "MEDIA_TROP_LOURD" });
    expect(mocks.optimize).not.toHaveBeenCalled();
  });

  it("laisse remonter l'erreur de l'optimiseur sans rien stocker", async () => {
    mocks.optimize.mockRejectedValue(Object.assign(new Error("ffmpeg"), { status: 503, code: "MEDIA_PROCESSOR_UNAVAILABLE" }));
    await expect(CardImageService.upload(PNG, "image/png")).rejects.toMatchObject({ code: "MEDIA_PROCESSOR_UNAVAILABLE" });
    expect(mocks.put).not.toHaveBeenCalled();
  });
});

describe("CardImageService.getPublic", () => {
  it("lit l'image dans card-models/ et la renvoie en WebP par défaut", async () => {
    mocks.get.mockResolvedValue({ body: {}, contentType: undefined, contentLength: 12 });
    const media = await CardImageService.getPublic(`${UUID}.webp`, "bytes=0-9");
    expect(mocks.get).toHaveBeenCalledWith(`card-models/${UUID}.webp`, "bytes=0-9");
    expect(media.contentType).toBe("image/webp");
  });

  it.each(["../secret.webp", `${UUID}.png`, "x.webp", `${UUID}.webp/../a`])("refuse le nom %s sans toucher au stockage", async name => {
    await expect(CardImageService.getPublic(name)).rejects.toMatchObject({ status: 404 });
    expect(mocks.get).not.toHaveBeenCalled();
  });

  it("une image absente du stockage donne 404 (et non 500)", async () => {
    mocks.get.mockRejectedValue(Object.assign(new Error("nope"), { name: "NoSuchKey" }));
    await expect(CardImageService.getPublic(`${UUID}.webp`)).rejects.toMatchObject({ status: 404 });
  });

  it("une panne du stockage reste une erreur serveur", async () => {
    mocks.get.mockRejectedValue(new Error("réseau"));
    await expect(CardImageService.getPublic(`${UUID}.webp`)).rejects.toThrow("réseau");
  });
});

describe("CardImageService.deleteRef / toAbsolute", () => {
  it("supprime le fichier d'une référence relative ou absolue de l'API", async () => {
    await CardImageService.deleteRef(`/api/media/cartes/${UUID}.webp`);
    await CardImageService.deleteRef(`http://localhost:4000/api/media/cartes/${UUID}.webp`);
    expect(mocks.del).toHaveBeenCalledTimes(2);
    expect(mocks.del).toHaveBeenCalledWith(`card-models/${UUID}.webp`);
  });

  it.each(["https://res.cloudinary.com/x/r.png", "/api/media/12/" + UUID + ".webp", "", null, undefined])(
    "ignore ce qui n'est pas une image de modèle de carte : %s",
    async ref => {
      await CardImageService.deleteRef(ref);
      expect(mocks.del).not.toHaveBeenCalled();
    }
  );

  it("un échec de suppression ne lève pas d'erreur", async () => {
    mocks.del.mockRejectedValue(new Error("S3 indisponible"));
    await expect(CardImageService.deleteRef(`/api/media/cartes/${UUID}.webp`)).resolves.toBeUndefined();
  });

  it("toAbsolute n'ajoute l'origine qu'aux références de l'API", () => {
    expect(CardImageService.toAbsolute(`/api/media/cartes/${UUID}.webp`)).toBe(`http://localhost:4000/api/media/cartes/${UUID}.webp`);
    expect(CardImageService.toAbsolute("https://res.cloudinary.com/x/r.png")).toBe("https://res.cloudinary.com/x/r.png");
  });
});

describe("route publique des images de carte", () => {
  it("est déclarée AVANT la route générique, sinon « cartes » serait lu comme un identifiant de fiche", () => {
    const paths = (mediaRouter.stack as { route?: { path: string } }[]).map(l => l.route?.path);
    expect(paths.indexOf("/cartes/:fileName")).toBeGreaterThanOrEqual(0);
    expect(paths.indexOf("/cartes/:fileName")).toBeLessThan(paths.indexOf("/:ficheId/:key"));
  });
});
