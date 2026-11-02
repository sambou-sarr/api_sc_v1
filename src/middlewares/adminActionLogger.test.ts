import { EventEmitter } from "node:events";
import type { Request, Response } from "express";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ create: vi.fn() }));

vi.mock("../database/prisma/prisma-client", () => ({
  prisma: { adminActionLog: { create: mocks.create } },
}));
vi.mock("../lib/logger", () => ({ logger: { error: vi.fn() } }));

import { adminActionLogger } from "./adminActionLogger";

beforeEach(() => {
  vi.clearAllMocks();
  mocks.create.mockResolvedValue({});
});

function runLogger(statusCode = 200, method = "PATCH", path = "/admin/settings") {
  const req = {
    method,
    path,
    user: {
      id: 8,
      role: "ADMIN",
      emailVerified: true,
      email: "admin@example.com",
      name: "Admin",
    },
  } as unknown as Request;
  const res = Object.assign(new EventEmitter(), {
    statusCode,
    locals: { requestId: "request-1" },
  }) as unknown as Response;
  const next = vi.fn();

  adminActionLogger(req, res, next);
  res.emit("finish");
  return { next };
}

describe("adminActionLogger", () => {
  it("stores successful admin mutations without request payloads", async () => {
    const { next } = runLogger();
    await Promise.resolve();

    expect(next).toHaveBeenCalledOnce();
    expect(mocks.create).toHaveBeenCalledWith({
      data: {
        adminId: 8,
        adminName: "Admin",
        adminEmail: "admin@example.com",
        method: "PATCH",
        path: "/admin/settings",
        statusCode: 200,
      },
    });
  });

  it("ignores failed requests and read-only requests", async () => {
    runLogger(400);
    runLogger(200, "GET");
    await Promise.resolve();

    expect(mocks.create).not.toHaveBeenCalled();
  });
});
