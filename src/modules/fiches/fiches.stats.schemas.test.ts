import { describe, expect, it } from "vitest";
import {
  passageStatsQuerySchema,
  recordPassageSchema,
} from "./fiches.schemas";

describe("recordPassageSchema", () => {
  it.each(["qr", "nfc", "direct"])("accepts source %s with a UUID idempotency key", source => {
    const result = recordPassageSchema.safeParse({
      source,
      idempotencyKey: "c4a7b2d1-3f6e-4a80-9a12-abcdef012345",
    });
    expect(result.success).toBe(true);
  });

  it("rejects unknown sources", () => {
    const result = recordPassageSchema.safeParse({
      source: "email",
      idempotencyKey: "c4a7b2d1-3f6e-4a80-9a12-abcdef012345",
    });
    expect(result.success).toBe(false);
  });

  it("rejects missing or malformed idempotency keys", () => {
    expect(recordPassageSchema.safeParse({ source: "qr", idempotencyKey: "short" }).success).toBe(false);
    expect(recordPassageSchema.safeParse({ source: "qr", idempotencyKey: "has spaces in it!!" }).success).toBe(false);
  });
});

describe("passageStatsQuerySchema", () => {
  it("defaults to monthly grouping for the complete history", () => {
    expect(passageStatsQuerySchema.parse({})).toEqual({ granularity: "month" });
  });

  it("accepts valid day and month filters", () => {
    expect(passageStatsQuerySchema.safeParse({ granularity: "day", date: "2026-10-16" }).success).toBe(true);
    expect(passageStatsQuerySchema.safeParse({ granularity: "month", month: "2026-10" }).success).toBe(true);
  });

  it("rejects malformed filters and simultaneous date/month filters", () => {
    expect(passageStatsQuerySchema.safeParse({ date: "16-10-2026" }).success).toBe(false);
    expect(passageStatsQuerySchema.safeParse({ month: "2026-13" }).success).toBe(false);
    expect(passageStatsQuerySchema.safeParse({ date: "2026-10-16", month: "2026-10" }).success).toBe(false);
  });
});
