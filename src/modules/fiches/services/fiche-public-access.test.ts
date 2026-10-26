import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getEffectiveSubscription: vi.fn(),
}));

vi.mock("../../subscriptions/subscriptions.service", () => ({
  getEffectiveSubscription: mocks.getEffectiveSubscription,
}));

import { getPublicSubscription } from "./fiche-public-access";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("getPublicSubscription", () => {
  it("returns the current subscription only for an active fiche", async () => {
    const subscription = { id: 7 };
    mocks.getEffectiveSubscription.mockResolvedValue(subscription);

    await expect(getPublicSubscription(12, "ACTIVE")).resolves.toBe(subscription);
    await expect(getPublicSubscription(12, "SUSPENDUE")).resolves.toBeNull();
    await expect(getPublicSubscription(12, "BROUILLON")).resolves.toBeNull();
    expect(mocks.getEffectiveSubscription).toHaveBeenCalledTimes(1);
  });

  it("denies public access when no current subscription exists", async () => {
    mocks.getEffectiveSubscription.mockResolvedValue(null);

    await expect(getPublicSubscription(12, "ACTIVE")).resolves.toBeNull();
  });
});
