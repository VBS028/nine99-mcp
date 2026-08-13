import { z } from "zod";
import type { Transport } from "../transport.js";
import type { RatesProvider } from "../rates.js";
import { classifyIntent } from "../classify.js";
import { looseIncludes, normalizeAd, truncateDescription } from "../normalize.js";
import { emptyDiagnostics, type Listing, type RawAd, type SearchResponse } from "../types.js";

const PAGE_SIZE = 78;
const MAX_PAGES = 5;

export const searchParamsSchema = z.object({
  query: z.union([z.string().min(1), z.array(z.string().min(1)).min(1)]),
  region: z.string().optional(),
  minPrice: z.number().nonnegative().optional(),
  maxPrice: z.number().positive().optional(),
  // All six confirmed legal by Task 2's spike via introspection of `Ads_Sort`.
  // Caveat recorded there: legality was confirmed, distinct ORDERING was not
  // (nobody compared result sets). Do not claim in the tool description that
  // relevance or random behave differently from date ordering.
  sort: z
    .enum(["date_desc", "date_asc", "price_asc", "price_desc", "relevance", "random"])
    .default("date_desc"),
  intent: z.enum(["sale", "any"]).default("sale"),
  lang: z.enum(["ro", "ru"]).optional(),
  limit: z.number().int().min(1).max(78).default(20),
  offset: z.number().int().min(0).default(0),
});

export type SearchParams = z.input<typeof searchParamsSchema>;

export const SEARCH_TOOL_DESCRIPTION = [
  "Search 999.md (Moldovan classifieds) and return normalized listings.",
  "",
  "IMPORTANT: 999.md does no cross-language matching. Listings are written in",
  "Russian OR Romanian, and searching one language misses most of the market",
  "(measured: 'bicycle' 1 result, 'велосипед' 20, 'bicicleta' 20).",
  "Always pass BOTH translations as an array, e.g. query: ['телевизор','televizor'].",
  "",
  "Prices are normalized to MDL. price.source says whether a price came from the",
  "price field ('listed') or was recovered from description text ('description').",
  "priceWarnings flags listings whose description contradicts the price field.",
  "Region filtering may be applied client-side, so it can only narrow the pages",
  "already fetched; check diagnostics to see how much was dropped.",
].join("\n");

const SORT_MAP: Record<string, string> = {
  date_desc: "SORT_ADS_DATE_DESC",
  date_asc: "SORT_ADS_DATE_ASC",
  price_asc: "SORT_ADS_PRICE_ASC",
  price_desc: "SORT_ADS_PRICE_DESC",
  relevance: "SORT_ADS_RELEVANCE",
  random: "SORT_ADS_RANDOM",
};

/**
 * Server-side price filtering, confirmed working by Task 2's spike.
 * Passing `unit: "UNIT_MDL"` makes the server currency-aware: it converts
 * EUR/USD-priced ads before comparing, so the range catches them too.
 * Verified live on query "televizor": no filter 2494 results, range 5000-8000
 * without unit 97, same range with unit 130 (the extra 33 being foreign-currency
 * ads whose converted price lands in band).
 *
 * Region is NOT server-side: no way was found to resolve a region name to its
 * numeric optionId. Region stays client-side substring matching. Do not invent
 * optionIds for it.
 *
 * ONLY `maxPrice` is sent server-side, and this is deliberate — do not "fix" it
 * by adding min.
 *
 * A placeholder-priced ad (the seller types 1 lei and writes the real price in
 * the description) would fail a server-side `min` and never reach us, so we
 * could never recover its real price — silently defeating the whole
 * price-recovery feature for exactly the ads it exists to rescue. A server-side
 * `max` has no such problem: a placeholder of 1 passes any max, and once the
 * real price is recovered locally the client-side bound drops it correctly.
 *
 * So: max narrows the fetch cheaply, min is enforced client-side after recovery.
 * Both bounds are still applied client-side in applyFilters — that is the
 * authoritative check, since it runs against recovered prices.
 */
function priceFilter(maxPrice?: number) {
  if (maxPrice === undefined) return [];
  return [
    {
      filterId: 2,
      op: "AND",
      features: [{ featureId: 2, range: { max: maxPrice }, unit: "UNIT_MDL" }],
    },
  ];
}

const GQL = `query SearchAds($input: Ads_SearchInput!) {
  searchAds(input: $input) { count ads {
    id title posted
    price: feature(id: 2) { value }
    region: feature(id: 7) { value }
    body: feature(id: 13) { value }
    phoneNumbers: feature(id: 16) { value }
    condition: feature(id: 593) { value }
  } }
}`;

interface SearchPayload {
  searchAds?: { count?: number; ads?: RawAd[] };
}

export function createSearch(deps: { transport: Transport; rates: RatesProvider }) {
  return async function search(rawParams: SearchParams): Promise<SearchResponse> {
    const p = searchParamsSchema.parse(rawParams);
    const terms = Array.isArray(p.query) ? p.query : [p.query];

    const { rates, warnings: rateWarnings } = await deps.rates.get();
    const diagnostics = emptyDiagnostics();
    const warnings = [...rateWarnings];

    const seen = new Map<string, RawAd>();
    const newAds: RawAd[] = [];
    let serverTotal = 0;

    // Track per-term pagination state
    interface TermState {
      page: number;
      exhausted: boolean;
    }
    const termStates = new Map<string, TermState>(terms.map((t) => [t, { page: 0, exhausted: false }]));
    const warnedTerms = new Set<string>();
    let kept: Listing[] = [];

    // Fetch page by page across every term until we have enough or hit the cap.
    // pagesFetched counts the number of rounds completed, not individual requests.
    for (let round = 0; round < MAX_PAGES; round++) {
      const allTermsExhausted = terms.every((t) => termStates.get(t)?.exhausted);
      if (allTermsExhausted) break;

      newAds.length = 0;

      for (const term of terms) {
        const state = termStates.get(term)!;
        if (state.exhausted) continue;

        let data: SearchPayload;
        try {
          data = await deps.transport.gql<SearchPayload>({
            operationName: "SearchAds",
            query: GQL,
            variables: {
              input: {
                source: "AD_SOURCE_DESKTOP_REDESIGN",
                sort: SORT_MAP[p.sort],
                pagination: { limit: PAGE_SIZE, skip: p.offset + state.page * PAGE_SIZE },
                filters: priceFilter(p.maxPrice),
                query: term,
              },
            },
          });
        } catch (err) {
          if (!warnedTerms.has(term)) {
            warnings.push(`Query "${term}" failed: ${String(err)}`);
            warnedTerms.add(term);
          }
          state.exhausted = true;
          continue;
        }
        serverTotal = Math.max(serverTotal, data.searchAds?.count ?? 0);

        const ads = data.searchAds?.ads ?? [];
        for (const ad of ads) {
          if (ad?.id != null && !seen.has(String(ad.id))) {
            seen.set(String(ad.id), ad);
            newAds.push(ad);
          }
        }

        // A term is exhausted when the server returns fewer than PAGE_SIZE ads
        if (ads.length < PAGE_SIZE) {
          state.exhausted = true;
        }
        state.page++;
      }

      diagnostics.pagesFetched = round + 1;

      // Filter only newly-fetched ads and add them to kept
      const newKept = applyFilters(newAds, p, rates, diagnostics, true);
      kept.push(...newKept);

      if (kept.length >= p.limit) break;
    }

    diagnostics.fetched = seen.size;

    if (diagnostics.fetched > 0 && diagnostics.droppedNoPrice === diagnostics.fetched) {
      warnings.push(
        `0 of ${diagnostics.fetched} results had a parseable price. The 999.md price field may have changed shape.`
      );
    }

    const listings = kept.slice(0, p.limit).map((l) => truncateDescription(l));
    diagnostics.returned = listings.length;
    diagnostics.matched = kept.length;

    return {
      listings,
      count: { serverTotal, returned: listings.length },
      diagnostics,
      warnings,
    };
  };
}

function applyFilters(
  ads: RawAd[],
  p: z.output<typeof searchParamsSchema>,
  rates: { MDL: number; EUR: number; USD: number },
  d: ReturnType<typeof emptyDiagnostics>,
  isIncremental: boolean = false
): Listing[] {
  if (!isIncremental) {
    d.droppedNoPrice = 0;
    d.droppedIntent = 0;
    d.droppedRegion = 0;
    d.droppedPrice = 0;
    d.droppedMalformed = 0;
  }

  const out: Listing[] = [];
  for (const ad of ads) {
    let listing: Listing;
    try {
      listing = normalizeAd(ad, rates, p.lang);
    } catch {
      d.droppedMalformed++;
      continue;
    }
    listing.intent = classifyIntent(listing.title, listing.description);

    if (listing.price.mdl === null) { d.droppedNoPrice++; continue; }
    if (p.intent === "sale" && listing.intent !== "sale" && listing.intent !== "unknown") { d.droppedIntent++; continue; }
    if (p.region && !(listing.region && looseIncludes(listing.region, p.region))) { d.droppedRegion++; continue; }
    if (p.minPrice !== undefined && listing.price.mdl < p.minPrice) { d.droppedPrice++; continue; }
    if (p.maxPrice !== undefined && listing.price.mdl > p.maxPrice) { d.droppedPrice++; continue; }

    out.push(listing);
  }
  return out;
}
