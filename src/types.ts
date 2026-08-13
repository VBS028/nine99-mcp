export type Currency = "MDL" | "EUR" | "USD";
export type PriceSource = "listed" | "description" | "none";
export type Intent = "sale" | "service" | "wanted" | "parts" | "unknown";
export type Lang = "ro" | "ru";

export interface ListingPrice {
  mdl: number | null;
  original: { value: number; currency: Currency } | null;
  negotiable: boolean;
  source: PriceSource;
}

export interface Listing {
  id: string;
  title: string;
  url: string;
  price: ListingPrice;
  priceWarnings: string[];
  region: string | null;
  phones: string[];
  condition: string | null;
  intent: Intent;
  description: string;
  descriptionTruncated: boolean;
  posted: string | null;
  images?: string[];
}

export interface Diagnostics {
  fetched: number;
  matched: number;
  droppedNoPrice: number;
  droppedIntent: number;
  droppedRegion: number;
  droppedPrice: number;
  droppedMalformed: number;
  returned: number;
  pagesFetched: number;
}

export interface SearchResponse {
  listings: Listing[];
  count: { serverTotal: number; returned: number };
  diagnostics: Diagnostics;
  warnings: string[];
}

/** A raw `feature(id: N)` node as returned by the API. */
export interface RawFeature {
  value: unknown;
}

/** A raw ad from `searchAds.ads[]`, with our field aliases. */
export interface RawAd {
  id: string;
  title: string;
  posted?: string | null;
  price?: RawFeature | null;
  region?: RawFeature | null;
  body?: RawFeature | null;
  phoneNumbers?: RawFeature | null;
  condition?: RawFeature | null;
  images?: RawFeature | null;
}

/** Multipliers converting one unit of the currency into MDL. */
export interface Rates {
  MDL: number;
  EUR: number;
  USD: number;
}

export function emptyDiagnostics(): Diagnostics {
  return {
    fetched: 0,
    matched: 0,
    droppedNoPrice: 0,
    droppedIntent: 0,
    droppedRegion: 0,
    droppedPrice: 0,
    droppedMalformed: 0,
    returned: 0,
    pagesFetched: 0,
  };
}
