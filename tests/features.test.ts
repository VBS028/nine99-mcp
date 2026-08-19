import { describe, it, expect } from "vitest";
import { featureText, decodePrice, decodePhones, decodeRegion, decodeCondition, decodeImages, IMAGE_CDN_BASE } from "../src/features.js";

// NOTE: the real shape is FLAT — { ro, ru, translated }. There is no `i18n`
// wrapper. Confirmed by Task 2's spike across 234 real ads: 100% flat, 0% nested.
describe("featureText", () => {
  it("unwraps a translated object rather than stringifying it", () => {
    const f = { value: { ro: "Merge perfect", ru: "Работает", translated: "Merge perfect" } };
    expect(featureText(f)).toBe("Merge perfect");
    expect(featureText(f)).not.toContain("[object Object]");
  });

  it("honours a language preference by reading the key directly", () => {
    const f = { value: { ro: "Merge perfect", ru: "Работает", translated: "Merge perfect" } };
    expect(featureText(f, "ru")).toBe("Работает");
  });

  it("does not use `translated` as a shortcut for the requested language", () => {
    // `translated` was observed always equal to `ro`, never `ru`. Reading it
    // when the caller asked for `ru` would silently return Romanian.
    const f = { value: { ro: "Romanian text", ru: "Русский текст", translated: "Romanian text" } };
    expect(featureText(f, "ru")).toBe("Русский текст");
  });

  it("falls back to the other language when the preferred one is empty", () => {
    // Not exercised by real fixture data — every captured ad had both. Written
    // defensively because a one-language ad is plausible.
    const f = { value: { ro: "", ru: "Работает" } };
    expect(featureText(f, "ro")).toBe("Работает");
  });

  it("returns an empty string for null", () => {
    expect(featureText(null)).toBe("");
    expect(featureText(undefined)).toBe("");
  });

  it("passes plain strings through", () => {
    expect(featureText({ value: "hello" })).toBe("hello");
  });
});

describe("decodePrice", () => {
  it("decodes an MDL price", () => {
    const f = { value: { value: 2800, unit: "UNIT_MDL", bargain: false } };
    expect(decodePrice(f)).toEqual({ value: 2800, currency: "MDL", negotiable: false });
  });

  it("decodes a EUR price without converting", () => {
    const f = { value: { value: 120, unit: "UNIT_EUR", bargain: true } };
    expect(decodePrice(f)).toEqual({ value: 120, currency: "EUR", negotiable: true });
  });

  it("decodes a USD price", () => {
    expect(decodePrice({ value: { value: 50, unit: "UNIT_USD", bargain: false } })?.currency).toBe("USD");
  });

  it("returns null for a missing or zero price", () => {
    expect(decodePrice(null)).toBeNull();
    expect(decodePrice({ value: { value: 0, unit: "UNIT_MDL" } })).toBeNull();
  });
});

describe("decodePhones", () => {
  it("extracts the phone_numbers array", () => {
    expect(decodePhones({ value: { phone_numbers: ["37366660304", "37375803501"] } }))
      .toEqual(["37366660304", "37375803501"]);
  });

  it("returns an empty array when absent", () => {
    expect(decodePhones(null)).toEqual([]);
    expect(decodePhones({ value: {} })).toEqual([]);
  });
});

describe("decodeRegion / decodeCondition", () => {
  it("reads the translated label", () => {
    expect(decodeRegion({ value: { translated: "Chișinău mun.", value: 12900 } })).toBe("Chișinău mun.");
    expect(decodeCondition({ value: { translated: "Uzat", value: 6371 } })).toBe("Uzat");
  });

  it("returns null when absent", () => {
    expect(decodeRegion(null)).toBeNull();
    expect(decodeCondition(undefined)).toBeNull();
  });
});

describe("decodeImages", () => {
  it("converts bare filenames to full CDN URLs", () => {
    const f = { value: ["0c1359d5286a5a4029bf27ab6bce2fff", "ee388f60994516dbd16fdbe46bb4c0d2"] };
    const urls = decodeImages(f);
    expect(urls).toEqual([
      `${IMAGE_CDN_BASE}/0c1359d5286a5a4029bf27ab6bce2fff.jpg`,
      `${IMAGE_CDN_BASE}/ee388f60994516dbd16fdbe46bb4c0d2.jpg`,
    ]);
  });

  it("passes through already-absolute URLs unchanged (idempotent)", () => {
    const absoluteUrl = "https://example.com/image.jpg";
    const f = { value: [absoluteUrl] };
    const urls = decodeImages(f);
    expect(urls).toEqual([absoluteUrl]);
  });

  it("handles empty/missing values", () => {
    expect(decodeImages(null)).toEqual([]);
    expect(decodeImages(undefined)).toEqual([]);
    expect(decodeImages({ value: [] })).toEqual([]);
    expect(decodeImages({ value: null })).toEqual([]);
  });

  it("extracts images from the { images: [...] } wrapper shape", () => {
    const f = { value: { images: ["abc123", "def456"] } };
    const urls = decodeImages(f);
    expect(urls).toEqual([
      `${IMAGE_CDN_BASE}/abc123.jpg`,
      `${IMAGE_CDN_BASE}/def456.jpg`,
    ]);
  });
});
