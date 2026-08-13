import { describe, it, expect, vi } from "vitest";
import { createTransport, GqlError } from "../src/transport.js";

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

const req = { operationName: "X", query: "query X { x }", variables: {} };

describe("transport", () => {
  it("returns the data payload on success", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse({ data: { x: 1 } }));
    const t = createTransport({ fetchImpl, minIntervalMs: 0 });
    expect(await t.gql(req)).toEqual({ x: 1 });
  });

  it("sends the Chrome User-Agent", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse({ data: {} }));
    const t = createTransport({ fetchImpl, minIntervalMs: 0 });
    await t.gql(req);
    const headers = fetchImpl.mock.calls[0][1].headers as Record<string, string>;
    expect(headers["User-Agent"]).toContain("Chrome/");
  });

  it("throws on a 200 response carrying a GraphQL errors array", async () => {
    const fetchImpl = vi.fn().mockImplementation(async () =>
      jsonResponse({ errors: [{ message: "UNAUTHENTICATED", extensions: { code: "UNAUTHENTICATED" } }] })
    );
    const t = createTransport({ fetchImpl, minIntervalMs: 0 });
    await expect(t.gql(req)).rejects.toThrow(GqlError);
    await expect(t.gql(req)).rejects.toThrow(/UNAUTHENTICATED/);
  });

  it("retries twice on network failure then succeeds", async () => {
    const fetchImpl = vi
      .fn()
      .mockRejectedValueOnce(new Error("ECONNRESET"))
      .mockRejectedValueOnce(new Error("ECONNRESET"))
      .mockResolvedValue(jsonResponse({ data: { x: 2 } }));
    const t = createTransport({ fetchImpl, minIntervalMs: 0, backoffMs: 0 });
    expect(await t.gql(req)).toEqual({ x: 2 });
    expect(fetchImpl).toHaveBeenCalledTimes(3);
  });

  it("gives up after exhausting retries", async () => {
    const fetchImpl = vi.fn().mockRejectedValue(new Error("ECONNRESET"));
    const t = createTransport({ fetchImpl, minIntervalMs: 0, backoffMs: 0 });
    await expect(t.gql(req)).rejects.toThrow(/999\.md/);
    expect(fetchImpl).toHaveBeenCalledTimes(3);
  });

  it("serializes requests with a minimum interval", async () => {
    const times: number[] = [];
    const fetchImpl = vi.fn().mockImplementation(async () => {
      times.push(Date.now());
      return jsonResponse({ data: {} });
    });
    const t = createTransport({ fetchImpl, minIntervalMs: 50 });
    await Promise.all([t.gql(req), t.gql(req), t.gql(req)]);
    expect(times).toHaveLength(3);
    expect(times[1] - times[0]).toBeGreaterThanOrEqual(45);
    expect(times[2] - times[1]).toBeGreaterThanOrEqual(45);
  });
});
