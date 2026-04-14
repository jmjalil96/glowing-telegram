import { afterEach, describe, expect, it, vi } from "vitest";

import { fetchJson, isApiError } from "@/lib/api";

describe("fetchJson", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("sends JSON requests with credentials included", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          success: true,
        }),
        {
          headers: {
            "content-type": "application/json",
          },
          status: 200,
        },
      ),
    );

    await fetchJson("/api/v1/auth/login", {
      body: {
        email: "User@Example.com",
        password: "Techbros123!",
      },
      method: "POST",
    });

    expect(fetchSpy).toHaveBeenCalledTimes(1);

    const [path, options] = fetchSpy.mock.calls[0] ?? [];
    const headers = new Headers(options?.headers);

    expect(path).toBe("/api/v1/auth/login");
    expect(headers.get("accept")).toBe("application/json");
    expect(headers.get("content-type")).toBe("application/json");
    expect(options?.body).toBe(
      JSON.stringify({
        email: "User@Example.com",
        password: "Techbros123!",
      }),
    );
    expect(options?.credentials).toBe("include");
  });

  it("does not force content-type when no body is present", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          user: {
            email: "user@example.com",
          },
        }),
        {
          headers: {
            "content-type": "application/json",
          },
          status: 200,
        },
      ),
    );

    await fetchJson("/api/v1/auth/me", {
      method: "GET",
    });

    const [, options] = fetchSpy.mock.calls[0] ?? [];
    const headers = new Headers(options?.headers);

    expect(headers.get("accept")).toBe("application/json");
    expect(headers.has("content-type")).toBe(false);
    expect(options?.credentials).toBe("include");
  });

  it("returns undefined for 204 responses", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(null, {
        status: 204,
      }),
    );

    await expect(
      fetchJson<undefined>("/api/v1/auth/logout", {
        method: "POST",
      }),
    ).resolves.toBeUndefined();
  });

  it("throws a structured ApiError for API error envelopes", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          error: {
            code: "ACCOUNT_INACTIVE",
            details: [],
            message: "This account is inactive.",
            requestId: "request-id-1",
          },
        }),
        {
          headers: {
            "content-type": "application/json",
          },
          status: 403,
        },
      ),
    );

    await expect(
      fetchJson("/api/v1/auth/login", {
        body: {
          email: "user@example.com",
          password: "Techbros123!",
        },
        method: "POST",
      }),
    ).rejects.toMatchObject({
      code: "ACCOUNT_INACTIVE",
      message: "This account is inactive.",
      requestId: "request-id-1",
      status: 403,
    });
  });

  it("falls back to a generic ApiError when the server response is malformed", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response("no json here", {
        status: 500,
        statusText: "Internal Server Error",
      }),
    );

    try {
      await fetchJson("/api/v1/auth/login", {
        body: {
          email: "user@example.com",
          password: "Techbros123!",
        },
        method: "POST",
      });
      throw new Error("Expected fetchJson to throw");
    } catch (error) {
      expect(isApiError(error)).toBe(true);

      if (!isApiError(error)) {
        throw error;
      }

      expect(error.code).toBe("HTTP_ERROR");
      expect(error.message).toBe("Internal Server Error");
      expect(error.requestId).toBeNull();
      expect(error.status).toBe(500);
    }
  });
});
