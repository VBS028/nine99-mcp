import { z } from "zod";
import type { Transport } from "../transport.js";
import type { RatesProvider } from "../rates.js";
import { classifyIntent } from "../classify.js";
import { normalizeAd } from "../normalize.js";
import type { Listing, RawAd } from "../types.js";

export const getListingParamsSchema = z.object({
  id: z.string().min(1),
  lang: z.enum(["ro", "ru"]).optional(),
});

export const GET_LISTING_TOOL_DESCRIPTION = [
  "Fetch one 999.md listing by id, with the full untruncated description,",
  "all photos, and the seller's phone numbers.",
  "Use the id returned by search_999.",
].join("\n");

const GQL = `query AdDetailLookup999($input: AdvertInput!) {
  advert(input: $input) {
    id title posted
    price: feature(id: 2) { value }
    region: feature(id: 7) { value }
    body: feature(id: 13) { value }
    images: feature(id: 14) { value }
    phoneNumbers: feature(id: 16) { value }
    condition: feature(id: 593) { value }
  }
}`;

export function createGetListing(deps: { transport: Transport; rates: RatesProvider }) {
  return async function getListing(raw: z.input<typeof getListingParamsSchema>): Promise<Listing> {
    const p = getListingParamsSchema.parse(raw);
    const { rates } = await deps.rates.get();

    const data = await deps.transport.gql<{ advert?: RawAd | null }>({
      operationName: "AdDetailLookup999",
      query: GQL,
      variables: { input: { id: p.id } },
    });

    const ad = data?.advert;
    if (!ad) throw new Error(`999.md listing ${p.id} was not found — it may have been sold or removed.`);

    const listing = normalizeAd(ad, rates, p.lang);
    listing.intent = classifyIntent(listing.title, listing.description);
    return listing; // deliberately not truncated
  };
}
