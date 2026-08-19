import type { Currency, Lang, RawFeature } from "./types.js";

export const FEATURE = {
  PRICE: 2,
  REGION: 7,
  BODY: 13,
  IMAGES: 14,
  PHONES: 16,
  CONDITION: 593,
} as const;

export const IMAGE_CDN_BASE = "https://i.simpalsmedia.com/999.md/BoardImages/900x900";

const UNIT_TO_CURRENCY: Record<string, Currency> = {
  UNIT_MDL: "MDL",
  UNIT_EUR: "EUR",
  UNIT_USD: "USD",
};

function isObj(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null;
}

/**
 * Bilingual feature values have the FLAT shape `{ ro, ru, translated }`.
 * There is no `i18n` wrapper — Task 2's spike confirmed this across 234 real
 * ads (100% flat, 0% nested). String() on one yields "[object Object]", a real
 * bug hit during reverse-engineering.
 *
 * Resolution order is deliberate: the requested language by key, then the other
 * language, and only then `translated`. `translated` was observed always equal
 * to `ro` and never `ru`, so preferring it over an explicit `ru` request would
 * silently hand back Romanian.
 */
export function featureText(f: RawFeature | null | undefined, lang?: Lang): string {
  const v = f?.value;
  if (v == null) return "";
  if (typeof v === "string") return v;
  if (!isObj(v)) return String(v);

  const str = (x: unknown): string | null =>
    typeof x === "string" && x.trim() ? x : null;

  if (lang) {
    const wanted = str(v[lang]);
    if (wanted) return wanted;
    const other = str(v[lang === "ro" ? "ru" : "ro"]);
    if (other) return other;
  }

  const translated = str(v.translated);
  if (translated) return translated;

  const ro = str(v.ro);
  if (ro) return ro;
  const ru = str(v.ru);
  if (ru) return ru;

  const parts: string[] = [];
  (function walk(o: unknown) {
    if (typeof o === "string") { if (o.trim()) parts.push(o); return; }
    if (isObj(o)) for (const k of Object.keys(o)) walk(o[k]);
  })(v);
  return parts.join(" ");
}

export function decodePrice(
  f: RawFeature | null | undefined
): { value: number; currency: Currency; negotiable: boolean } | null {
  const v = f?.value;
  if (!isObj(v)) return null;
  const n = Number(v.value);
  if (!Number.isFinite(n) || n <= 0) return null;
  return {
    value: n,
    currency: UNIT_TO_CURRENCY[String(v.unit)] ?? "MDL",
    negotiable: Boolean(v.bargain),
  };
}

export function decodePhones(f: RawFeature | null | undefined): string[] {
  const v = f?.value;
  if (!isObj(v)) return [];
  const list = v.phone_numbers;
  if (!Array.isArray(list)) return [];
  return list.filter((x): x is string => typeof x === "string");
}

function translated(f: RawFeature | null | undefined): string | null {
  const v = f?.value;
  if (!isObj(v)) return null;
  return typeof v.translated === "string" && v.translated.trim() ? v.translated : null;
}

export const decodeRegion = translated;
export const decodeCondition = translated;

export function decodeImages(f: RawFeature | null | undefined): string[] {
  const v = f?.value;
  let filenames: string[] = [];
  if (Array.isArray(v)) {
    filenames = v.filter((x): x is string => typeof x === "string");
  } else if (isObj(v) && Array.isArray(v.images)) {
    filenames = (v.images as unknown[]).filter((x): x is string => typeof x === "string");
  }

  // Convert filenames to full URLs, or pass through if already absolute
  return filenames.map((filename) => {
    if (filename.startsWith("http://") || filename.startsWith("https://")) {
      return filename;
    }
    return `${IMAGE_CDN_BASE}/${filename}.jpg`;
  });
}
