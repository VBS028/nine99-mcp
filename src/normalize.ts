import { decodeCondition, decodeImages, decodePhones, decodePrice, decodeRegion, featureText } from "./features.js";
import type { Lang, Listing, RawAd, Rates } from "./types.js";

/** Below this, a "price" is a placeholder (1 lei) rather than a real figure. */
const PLACEHOLDER_MAX = 150;
/** Bounds for a number in free text to be plausibly a price in MDL. */
const TEXT_PRICE_MIN = 300;
const TEXT_PRICE_MAX = 400_000;

export function stripDiacritics(s: string): string {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[țţ]/gi, "t").replace(/[șş]/gi, "s");
}

export function looseIncludes(haystack: string, needle: string): boolean {
  return stripDiacritics(haystack).toLowerCase().includes(stripDiacritics(needle).toLowerCase());
}

/**
 * Prices written into description text, in either language.
 * Sellers routinely put the real price here when the price field is a placeholder.
 */
export function pricesInText(text: string, rates: Rates): number[] {
  if (!text) return [];
  const out: number[] = [];
  const re = /(\d[\d\s.,']{0,8}\d|\d{3,6})\s*(lei|леев|лей|mdl|euro|eur|€|\$|usd|у\.?е\.?)/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    const n = parseInt(m[1].replace(/[\s.',]/g, ""), 10);
    if (!Number.isFinite(n)) continue;
    const cur = m[2].toLowerCase();
    let mdl = n;
    if (/euro|eur|€/.test(cur)) mdl = Math.round(n * rates.EUR);
    else if (/\$|usd|у\.?е\.?/.test(cur)) mdl = Math.round(n * rates.USD);
    if (mdl >= TEXT_PRICE_MIN && mdl <= TEXT_PRICE_MAX) out.push(mdl);
  }
  return out;
}

export function normalizeAd(ad: RawAd, rates: Rates, lang?: Lang): Listing {
  const title = (ad.title ?? "").replace(/\s+/g, " ").trim();
  const description = featureText(ad.body, lang).replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();

  const listed = decodePrice(ad.price);
  const warnings: string[] = [];

  // An unrecognised unit still converts as MDL (better a usable number than
  // none), but must not be presented as if it truly were MDL — see below.
  let mdl: number | null = listed ? Math.round(listed.value * rates[listed.currency ?? "MDL"]) : null;
  let source: Listing["price"]["source"] = listed ? "listed" : "none";

  if (listed && listed.currency === null) {
    warnings.push(
      `Listed price unit "${listed.rawUnit}" is not a recognized currency; treating ${listed.value} as MDL, which may be significantly inaccurate.`
    );
  }

  if (listed?.mode === "PM_FROM") {
    warnings.push(
      `Listed price of ${listed.value} ${listed.currency ?? listed.rawUnit} is a starting ("from") price, not a fixed price — the actual price may be higher.`
    );
  } else if (listed?.mode && listed.mode !== "PM_FIXED") {
    // Defensive: the mode set observed in the fixture corpus is {PM_FIXED, PM_FROM},
    // but do not silently treat an unrecognized mode as a definite fixed price.
    warnings.push(
      `Listed price has an unrecognized mode "${listed.mode}"; it may not be a fixed price.`
    );
  }

  const inText = pricesInText(`${title} ${description}`, rates);
  const distinctPrices = [...new Set(inText)];
  const hasMultiplePrices = distinctPrices.length > 2;

  if (mdl !== null && mdl < PLACEHOLDER_MAX) {
    // Placeholder price
    if (!inText.length) {
      // Placeholder with no recoverable text (Finding 1)
      warnings.push(`Listed price is a placeholder (${mdl} MDL) with no recoverable price in the description.`);
      mdl = null;
      source = "none";
    } else if (hasMultiplePrices) {
      // Placeholder with ambiguous text (Finding 2)
      warnings.push(`Listed price is a placeholder (${mdl} MDL).`);
      warnings.push(`Description contains multiple prices: ${distinctPrices.join(", ")} MDL. Cannot determine listing price.`);
      mdl = null;
      source = "none";
    } else {
      // Placeholder with clear recovery (1-2 prices)
      mdl = Math.min(...inText);
      source = "description";
    }
  } else if (mdl === null && inText.length) {
    // No listed price but description has prices
    if (hasMultiplePrices) {
      warnings.push(`Description contains multiple prices: ${distinctPrices.join(", ")} MDL. Cannot determine listing price.`);
    } else {
      mdl = Math.min(...inText);
      source = "description";
    }
  } else if (mdl !== null && source === "listed" && inText.length) {
    // Listed price with description prices
    if (hasMultiplePrices) {
      warnings.push(`Listed price is ${mdl} MDL, but the description contains multiple prices: ${distinctPrices.join(", ")} MDL. Confirm with the seller.`);
    } else {
      const agrees = inText.some((v) => Math.abs(v - mdl!) / mdl! < 0.05);
      if (!agrees) {
        warnings.push(
          `Listed price is ${mdl} MDL but the description mentions ${[...new Set(inText)].join(", ")} MDL. Confirm with the seller.`
        );
      }
    }
  }

  return {
    id: String(ad.id),
    title,
    url: `https://999.md/ro/${ad.id}`,
    price: {
      mdl,
      original: listed && listed.currency ? { value: listed.value, currency: listed.currency } : null,
      negotiable: listed?.negotiable ?? false,
      source,
    },
    priceWarnings: warnings,
    region: decodeRegion(ad.region),
    phones: decodePhones(ad.phoneNumbers),
    condition: decodeCondition(ad.condition),
    intent: "unknown",
    description,
    descriptionTruncated: false,
    posted: ad.posted ?? null,
    ...(ad.images ? { images: decodeImages(ad.images) } : {}),
  };
}

export function truncateDescription(l: Listing, max = 300): Listing {
  if (l.description.length <= max) return l;
  return { ...l, description: l.description.slice(0, max), descriptionTruncated: true };
}
