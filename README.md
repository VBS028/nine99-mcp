# nine99-mcp

An [MCP](https://modelcontextprotocol.io) server for [999.md](https://999.md), the largest classifieds site in Moldova. It lets an MCP client such as Claude Code or Claude Desktop search listings, open a single listing with its full description, photos and phone numbers, and browse the category tree.

It talks to the same GraphQL endpoint the 999.md website uses. No account or API key is needed.

> **Unofficial.** This project is not affiliated with 999.md or Simpals. The endpoint it uses is not a public, documented API, so it can change or break without notice. Use it for personal research at a reasonable request rate.

## Features

- **Search** listings by keyword, price range, region and sort order.
- **Bilingual queries.** Pass the Russian and the Romanian term together and the results are merged and de-duplicated.
- **Prices in MDL.** EUR and USD prices are converted with the exchange rates 999.md publishes. The original price is kept too.
- **Cleaner results.** "Wanted" ads, spare parts and services are filtered out by default, and listings whose description contradicts their price are flagged.
- **Listing details.** Full description, every photo URL and the seller's phone numbers.
- **Category tree** of 999.md.
- **Polite by default.** Requests are serialized, paced and retried.

## Example

Once the server is registered, ask your MCP client in plain language:

> Find a used road bike in Chișinău under 8000 lei and show me the three cheapest.

The client calls `search_999` with something like:

```json
{
  "query": ["шоссейный велосипед", "bicicleta de sosea"],
  "maxPrice": 8000,
  "region": "chisinau",
  "sort": "price_asc",
  "limit": 3
}
```

and gets back normalized listings:

```json
{
  "listings": [
    {
      "id": "98765432",
      "title": "Bicicleta de sosea Giant",
      "url": "https://999.md/ro/98765432",
      "price": {
        "mdl": 6500,
        "original": { "value": 6500, "currency": "MDL" },
        "negotiable": false,
        "source": "listed"
      },
      "priceWarnings": [],
      "region": "Chișinău",
      "phones": ["+373..."],
      "condition": "Used",
      "intent": "sale",
      "description": "Bicicleta in stare buna...",
      "descriptionTruncated": true,
      "posted": "2026-10-20T09:14:00Z"
    }
  ],
  "count": { "serverTotal": 41, "returned": 3 },
  "diagnostics": { "fetched": 156, "matched": 41, "droppedRegion": 102, "...": "..." },
  "warnings": []
}
```

The values above are illustrative.

## Requirements

- Node.js 18 or newer (the server uses the built-in `fetch`)

## Install

```bash
git clone https://github.com/VBS028/nine99-mcp.git
cd nine99-mcp
npm install
npm run build
```

The build writes the server to `dist/src/server.js`.

## Register with a client

### Claude Code

```bash
claude mcp add nine99 -- node /absolute/path/to/nine99-mcp/dist/src/server.js
```

### Claude Desktop and other clients

Add the server to the client's MCP config:

```json
{
  "mcpServers": {
    "nine99": {
      "command": "node",
      "args": ["/absolute/path/to/nine99-mcp/dist/src/server.js"]
    }
  }
}
```

On Windows, use forward slashes or escaped backslashes in the path, for example `"C:/tools/nine99-mcp/dist/src/server.js"`.

If you switch Node versions with nvm, use the absolute path to a Node 18+ binary as `command` instead of bare `node`. On an older Node the server exits at startup with a message saying so.

## Tools

### `search_999`

Searches listings and returns them in a normalized shape.

| Parameter | Type | Default | Notes |
|---|---|---|---|
| `query` | string or string[] | required | Pass both the Russian and the Romanian term, see below |
| `minPrice`, `maxPrice` | number | none | In MDL. EUR and USD listings are converted before comparing |
| `region` | string | none | Substring match on the listing's region, for example `chisinau` |
| `sort` | `date_desc`, `date_asc`, `price_asc`, `price_desc`, `relevance`, `random` | `date_desc` | |
| `limit` | 1 to 78 | 20 | |
| `offset` | number | 0 | |
| `intent` | `sale` or `any` | `sale` | `sale` drops "wanted", spare-parts and service ads |
| `lang` | `ro` or `ru` | none | Language of the returned listing text |

Each listing has these fields:

| Field | Description |
|---|---|
| `id` | Listing id, used by `get_listing_999` |
| `title`, `url` | Ad title and link to the ad on 999.md |
| `price` | `mdl`, `original` (value and currency), `negotiable`, `source` |
| `priceWarnings` | Contradictions between the price field and the description |
| `region`, `condition`, `posted` | As shown on the ad, or `null` |
| `phones` | Seller phone numbers |
| `intent` | `sale`, `service`, `wanted`, `parts` or `unknown` |
| `description`, `descriptionTruncated` | Ad text, cut to 300 characters in search results |

The response also carries `count`, `warnings` and `diagnostics`. `diagnostics` shows how many listings were fetched and how many were dropped for each reason (no price, intent, region, price range, malformed).

### `get_listing_999`

Fetches one listing by the `id` from a search result. Takes `id` and an optional `lang`. Returns the full description, all photo URLs and the seller's phone numbers.

### `list_categories_999`

Returns the category tree as `{ id, title, children? }` nodes. This is best-effort: it returns an empty array if the request fails.

## Things worth knowing

- **Search both languages.** 999.md does not match across languages, and ads are written in Russian or Romanian. Searching only one misses most of the market, so pass both, for example `["телевизор", "televizor"]`.
- **Prices are in MDL.** Listings priced in EUR or USD are converted with the rates 999.md publishes. `price.original` keeps the listed value and currency. If the rates cannot be fetched, the server falls back to built-in rates and adds a warning to the response.
- **Listings without a price are skipped** in search results. They are counted in `diagnostics.droppedNoPrice`.
- **`price.source`** is `listed` when the price came from the price field and `description` when it was recovered from the ad text.
- **`priceWarnings`** flags listings whose description mentions prices that contradict the price field. Shop ads that list a whole catalogue trigger this often.
- **Region filtering is client-side.** It only narrows the pages already fetched (up to 5 pages per search), so a narrow region can return fewer results than `limit`. Check `diagnostics.droppedRegion` to see how much was removed.
- **Requests are paced.** They run one at a time, at least 300 ms apart, with two retries and a 20 second timeout.

## Development

```bash
npm test                          # unit tests, run against saved fixtures
npm run test:watch
npm run build                     # compile TypeScript to dist/
npx tsx scripts/verify-e2e.ts     # smoke test against the live 999.md API
npm run fixtures                  # re-capture the test fixtures from the live API
```

### Project layout

```
src/
  server.ts            MCP server entry point, registers the tools
  transport.ts         GraphQL client: pacing, retries, timeouts
  rates.ts             EUR/USD to MDL exchange rates
  features.ts          Decoders for 999.md "feature" fields (price, region, phones...)
  normalize.ts         Raw ad to normalized listing
  classify.ts          Sale / wanted / parts / service classification
  tools/               search_999, get_listing_999, list_categories_999
tests/                 Vitest unit tests and recorded API fixtures
scripts/               Live API spike, fixture capture, end-to-end check
docs/superpowers/      Design spec and implementation plan
```

## Contributing

Issues and pull requests are welcome. If 999.md changes its API and something breaks, run `npx tsx scripts/verify-e2e.ts` to see which part fails, and include its output in the issue.
