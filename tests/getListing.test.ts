import { describe, it, expect, vi } from "vitest";
import { createGetListing } from "../src/tools/getListing.js";
import { FALLBACK_RATES } from "../src/rates.js";
import type { Transport } from "../src/transport.js";

const rates = { get: async () => ({ rates: FALLBACK_RATES, warnings: [] }) };

describe("get_listing_999", () => {
  it("returns a full, untruncated listing", async () => {
    const transport: Transport = {
      gql: vi.fn().mockResolvedValue({
        advert: {
          id: "104254352",
          title: "Xiaomi TV A 32",
          price: { value: { value: 2700, unit: "UNIT_MDL", bargain: false } },
          body: { value: { translated: "z".repeat(900) } },
          phoneNumbers: { value: { phone_numbers: ["37366660304"] } },
          region: { value: { translated: "Chișinău mun." } },
        },
      }),
    };
    const l = await createGetListing({ transport, rates })({ id: "104254352" });
    expect(l.id).toBe("104254352");
    expect(l.price.mdl).toBe(2700);
    expect(l.phones).toEqual(["37366660304"]);
    expect(l.description).toHaveLength(900);
    expect(l.descriptionTruncated).toBe(false);
  });

  it("throws a clear error when the listing is gone", async () => {
    const transport: Transport = { gql: vi.fn().mockResolvedValue({ advert: null }) };
    await expect(createGetListing({ transport, rates })({ id: "1" })).rejects.toThrow(/not found|removed/i);
  });
});
