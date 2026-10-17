import { describe, expect, it } from "vitest";
import { collectStoredMediaKeys } from "./media.validation";
import {
  assertMenuVideoDuration,
  mediaUploadQuery,
  parseProbeDuration,
  mediaMaxBytes,
  resolveMediaMime,
  validateMediaSignature,
} from "./media.validation";

describe("media validation", () => {
  it("accepts supported MIME types and strips parameters", () => {
    expect(resolveMediaMime("image/webp")).toBe("image/webp");
    expect(resolveMediaMime("video/mp4; codecs=h264")).toBe("video/mp4");
  });

  it("rejects unsupported MIME types", () => {
    expect(() => resolveMediaMime("image/svg+xml")).toThrow();
    expect(() => resolveMediaMime("application/octet-stream")).toThrow();
  });

  it("applies separate image and video upload limits", () => {
    expect(mediaMaxBytes("image")).toBe(12 * 1024 * 1024);
    expect(mediaMaxBytes("video")).toBe(30 * 1024 * 1024);
  });

  it("checks signatures instead of trusting the MIME header", () => {
    expect(() => validateMediaSignature(Buffer.from("<svg/>"), "image/png")).toThrow();
    expect(() =>
      validateMediaSignature(Buffer.from([0xff, 0xd8, 0xff, 0x00]), "image/jpeg")
    ).not.toThrow();
    expect(() =>
      validateMediaSignature(Buffer.from([0x1a, 0x45, 0xdf, 0xa3]), "video/webm")
    ).not.toThrow();
  });
});

describe("stored media references", () => {
  it("collects only media keys belonging to the target fiche", () => {
    const keys = collectStoredMediaKeys({
      photo: "https://api.example.test/api/media/7/123e4567-e89b-12d3-a456-426614174000.webp",
      gallery: [
        { url: "/api/media/7/123e4567-e89b-12d3-a456-426614174001.mp4" },
        { url: "/api/media/8/123e4567-e89b-12d3-a456-426614174002.jpg" },
      ],
    }, 7);
    expect([...keys].sort()).toEqual([
      "123e4567-e89b-12d3-a456-426614174000.webp",
      "123e4567-e89b-12d3-a456-426614174001.mp4",
    ]);
  });
});

describe("durée des vidéos de menu", () => {
  it("lit la durée renvoyée par ffprobe", () => {
    expect(parseProbeDuration("12.480000\n")).toBeCloseTo(12.48);
    expect(parseProbeDuration("")).toBeNull();
    expect(parseProbeDuration("N/A")).toBeNull();
  });

  it("accepte jusqu'au maximum plus 0,5 s de tolérance", () => {
    expect(() => assertMenuVideoDuration(30, 30)).not.toThrow();
    expect(() => assertMenuVideoDuration(30.4, 30)).not.toThrow();
  });

  it("refuse une vidéo trop longue ou de durée inconnue", () => {
    expect(() => assertMenuVideoDuration(30.6, 30)).toThrow(/30 secondes/);
    expect(() => assertMenuVideoDuration(null, 30)).toThrow();
  });

  it("n'accepte que le motif « menu »", () => {
    expect(mediaUploadQuery.safeParse({ purpose: "menu" }).success).toBe(true);
    expect(mediaUploadQuery.safeParse({}).success).toBe(true);
    expect(mediaUploadQuery.safeParse({ purpose: "autre" }).success).toBe(false);
  });
});
