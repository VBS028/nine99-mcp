import { describe, it, expect, vi } from "vitest";
import { createSearch } from "../src/tools/search.js";
import type { Transport } from "../src/transport.js";
import { FALLBACK_RATES } from "../src/rates.js";

const rates = { get: async () => ({ rates: FALLBACK_RATES, warnings: [] }) };

function adsPayload(ads: unknown[], count = ads.length) {
  return { searchAds: { count, ads } };
}
const mkAd = (id: string, title: string, mdl: number, region = "Chișinău mun.") => ({
  id,
  title,
  price: { value: { value: mdl, unit: "UNIT_MDL", bargain: false } },
  region: { value: { translated: region } },
});

describe("search_999", () => {
  it("deduplicates the same listing returned by two query terms", async () => {
    const transport: Transport = {
      gql: vi
        .fn()
        .mockResolvedValueOnce(adsPayload([mkAd("1", "Televizor LG", 1000)]))
        .mockResolvedValueOnce(adsPayload([mkAd("1", "Телевизор LG", 1000)])),
    };
    const search = createSearch({ transport, rates });
    const res = await search({ query: ["televizor", "телевизор"] });
    expect(res.listings).toHaveLength(1);
    expect(res.count.returned).toBe(1);
  });

  it("filters by region with diacritic-insensitive matching", async () => {
    const transport: Transport = {
      gql: vi.fn().mockResolvedValue(
        adsPayload([mkAd("1", "Televizor", 1000, "Chișinău mun."), mkAd("2", "Televizor", 900, "Bălți mun.")])
      ),
    };
    const res = await createSearch({ transport, rates })({ query: "televizor", region: "chisinau" });
    expect(res.listings.map((l) => l.id)).toEqual(["1"]);
    expect(res.diagnostics.droppedRegion).toBe(1);
  });

  it("filters out services when intent is sale", async () => {
    const transport: Transport = {
      gql: vi.fn().mockResolvedValue(
        adsPayload([mkAd("1", "Vând televizor", 1000), mkAd("2", "Reparația televizoarelor", 300)])
      ),
    };
    const res = await createSearch({ transport, rates })({ query: "televizor" });
    expect(res.listings.map((l) => l.id)).toEqual(["1"]);
    expect(res.diagnostics.droppedIntent).toBe(1);
  });

  it("keeps services when intent is any", async () => {
    const transport: Transport = {
      gql: vi.fn().mockResolvedValue(
        adsPayload([mkAd("1", "Vând televizor", 1000), mkAd("2", "Reparația televizoarelor", 300)])
      ),
    };
    const res = await createSearch({ transport, rates })({ query: "televizor", intent: "any" });
    expect(res.listings).toHaveLength(2);
  });

  it("applies price bounds", async () => {
    const transport: Transport = {
      gql: vi.fn().mockResolvedValue(adsPayload([mkAd("1", "Vând tv", 500), mkAd("2", "Vând tv", 5000)])),
    };
    const res = await createSearch({ transport, rates })({ query: "tv", maxPrice: 1000 });
    expect(res.listings.map((l) => l.id)).toEqual(["1"]);
    expect(res.diagnostics.droppedPrice).toBe(1);
  });

  it("reports serverTotal separately from returned", async () => {
    const transport: Transport = {
      gql: vi.fn().mockResolvedValue(adsPayload([mkAd("1", "Vând tv", 500)], 645)),
    };
    const res = await createSearch({ transport, rates })({ query: "tv" });
    expect(res.count.serverTotal).toBe(645);
    expect(res.count.returned).toBe(1);
  });

  it("warns when every result failed to yield a price", async () => {
    const transport: Transport = {
      gql: vi.fn().mockResolvedValue(adsPayload([{ id: "1", title: "Vând tv", price: null }])),
    };
    const res = await createSearch({ transport, rates })({ query: "tv" });
    expect(res.listings).toHaveLength(0);
    expect(res.warnings.join(" ")).toMatch(/parseable price/i);
  });

  it("truncates descriptions to 300 characters", async () => {
    const long = { ...mkAd("1", "Vând tv", 500), body: { value: { translated: "y".repeat(500) } } };
    const transport: Transport = { gql: vi.fn().mockResolvedValue(adsPayload([long])) };
    const res = await createSearch({ transport, rates })({ query: "tv" });
    expect(res.listings[0].description).toHaveLength(300);
    expect(res.listings[0].descriptionTruncated).toBe(true);
  });

  it("stops fetching pages at the cap", async () => {
    // Every page is all-services, so the filter never fills `limit`.
    const page = adsPayload(Array.from({ length: 78 }, (_, i) => mkAd(String(i), "Reparația tv", 300)), 1000);
    const gql = vi.fn().mockResolvedValue(page);
    const res = await createSearch({ transport: { gql }, rates })({ query: "tv", limit: 20 });
    expect(res.diagnostics.pagesFetched).toBeLessThanOrEqual(5);
    expect(gql.mock.calls.length).toBeLessThanOrEqual(5);
  });
});
