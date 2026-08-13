import { describe, it, expect } from "vitest";
import { stripDiacritics, looseIncludes, pricesInText, normalizeAd, truncateDescription } from "../src/normalize.js";
import type { RawAd, Rates } from "../src/types.js";

const rates: Rates = { MDL: 1, EUR: 20, USD: 17 };

const ad = (over: Partial<RawAd> = {}): RawAd => ({
  id: "1",
  title: "Televizor",
  price: { value: { value: 1000, unit: "UNIT_MDL", bargain: false } },
  ...over,
});

describe("diacritics", () => {
  it("strips Romanian diacritics", () => {
    expect(stripDiacritics("Chișinău mun.")).toBe("Chisinau mun.");
  });

  it("matches user input against stored region names", () => {
    expect(looseIncludes("Chișinău mun.", "chisinau")).toBe(true);
    expect(looseIncludes("Bălți mun.", "chisinau")).toBe(false);
  });
});

describe("pricesInText", () => {
  it("finds a Romanian lei price", () => {
    expect(pricesInText("Preț 1350 lei", rates)).toContain(1350);
  });

  it("finds a Russian lei price", () => {
    expect(pricesInText("цена 800 лей", rates)).toContain(800);
  });

  it("converts euro to MDL", () => {
    expect(pricesInText("Preț: 120 euro", rates)).toContain(2400);
  });

  it("ignores implausibly small numbers", () => {
    expect(pricesInText("32 inch, 2 HDMI", rates)).toEqual([]);
  });
});

describe("normalizeAd", () => {
  it("converts a EUR price to MDL and keeps the original", () => {
    const l = normalizeAd(ad({ price: { value: { value: 120, unit: "UNIT_EUR", bargain: false } } }), rates);
    expect(l.price.mdl).toBe(2400);
    expect(l.price.original).toEqual({ value: 120, currency: "EUR" });
    expect(l.price.source).toBe("listed");
  });

  it("leaves an absent price null, never zero", () => {
    const l = normalizeAd(ad({ price: null }), rates);
    expect(l.price.mdl).toBeNull();
    expect(l.price.source).toBe("none");
  });

  it("recovers a real price from the description when the listed one is a placeholder", () => {
    const l = normalizeAd(
      ad({
        price: { value: { value: 1, unit: "UNIT_MDL", bargain: false } },
        body: { value: { translated: "Televizor bun. Preț 1350 lei" } },
      }),
      rates
    );
    expect(l.price.mdl).toBe(1350);
    expect(l.price.source).toBe("description");
  });

  it("warns when the listed price disagrees with the description", () => {
    const l = normalizeAd(
      ad({
        price: { value: { value: 1600, unit: "UNIT_MDL", bargain: false } },
        body: { value: { translated: "Preț 1350 lei" } },
      }),
      rates
    );
    expect(l.price.mdl).toBe(1600);
    expect(l.priceWarnings.join(" ")).toMatch(/1350/);
  });

  it("builds a url and decodes region and phones", () => {
    const l = normalizeAd(
      ad({
        region: { value: { translated: "Chișinău mun." } },
        phoneNumbers: { value: { phone_numbers: ["37366660304"] } },
      }),
      rates
    );
    expect(l.url).toBe("https://999.md/ro/1");
    expect(l.region).toBe("Chișinău mun.");
    expect(l.phones).toEqual(["37366660304"]);
  });
});

describe("truncateDescription", () => {
  it("trims and flags long descriptions", () => {
    const l = normalizeAd(ad({ body: { value: { translated: "x".repeat(400) } } }), rates);
    const t = truncateDescription(l, 300);
    expect(t.description).toHaveLength(300);
    expect(t.descriptionTruncated).toBe(true);
  });

  it("leaves short descriptions alone", () => {
    const l = normalizeAd(ad({ body: { value: { translated: "short" } } }), rates);
    expect(truncateDescription(l, 300).descriptionTruncated).toBe(false);
  });
});
