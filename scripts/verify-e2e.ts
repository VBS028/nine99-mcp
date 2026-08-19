/**
 * Living end-to-end smoke test for the 999.md MCP server.
 *
 * Imports the real tool factories (not a reimplementation of the GraphQL calls)
 * and drives them, in-process, against the LIVE 999.md API. Confirms the
 * invariants Task 11's brief calls out explicitly:
 *
 *   a. search_999(query: ["телевизор","televizor"], region: "chisinau", maxPrice: 2000)
 *      returns listings that are all in Chisinau and all <= 2000 MDL.
 *   b. diagnostics.pagesFetched >= 1, count.serverTotal > count.returned, and the
 *      dropped-reasons invariant balances against fetched.
 *   c. No listing anywhere has price.mdl === 0 (a hard constraint of the whole system).
 *   d. get_listing_999 on an id from those results returns phones and, where the ad
 *      has a long description, one over 300 characters (proving no truncation).
 *   e. images are full URLs and at least one resolves with HTTP 200 + image content-type.
 *   f. list_categories_999 returns a non-empty tree.
 *
 * Run with: npx tsx scripts/verify-e2e.ts
 * Exits non-zero if any check fails.
 */
import { createTransport } from "../src/transport.js";
import { createRates } from "../src/rates.js";
import { createSearch } from "../src/tools/search.js";
import { createGetListing } from "../src/tools/getListing.js";
import { createListCategories } from "../src/tools/listCategories.js";
import { looseIncludes } from "../src/normalize.js";
import type { Listing } from "../src/types.js";

interface CheckResult {
  name: string;
  pass: boolean;
  detail: string;
}

const results: CheckResult[] = [];
function check(name: string, pass: boolean, detail: string) {
  results.push({ name, pass, detail });
  console.log(`${pass ? "PASS" : "FAIL"} - ${name} - ${detail}`);
}

async function main() {
  const transport = createTransport();
  const rates = createRates(transport);

  const search = createSearch({ transport, rates });
  const getListing = createGetListing({ transport, rates });
  const listCategories = createListCategories({ transport });

  // ---------------------------------------------------------------------
  // a + b + c: search_999 against the live API
  // ---------------------------------------------------------------------
  console.log("\n=== search_999(query: [\"телевизор\",\"televizor\"], region: \"chisinau\", maxPrice: 2000) ===");
  const searchParams = {
    query: ["телевизор", "televizor"],
    region: "chisinau",
    maxPrice: 2000,
    limit: 78, // max page size — maximizes the sample for the invariant + truncation checks
  };
  const searchResult = await search(searchParams);

  check(
    "a. search returns listings",
    searchResult.listings.length > 0,
    `returned ${searchResult.listings.length} listings`
  );

  const badRegion = searchResult.listings.filter((l) => !(l.region && looseIncludes(l.region, "chisinau")));
  check(
    "a. every listing is in Chisinau",
    searchResult.listings.length > 0 && badRegion.length === 0,
    badRegion.length === 0
      ? `all ${searchResult.listings.length} listings matched region "chisinau"`
      : `${badRegion.length} listings had a non-matching region, e.g. ${JSON.stringify(badRegion[0]?.region)}`
  );

  const overPriced = searchResult.listings.filter((l) => l.price.mdl === null || l.price.mdl > 2000);
  check(
    "a. every listing is <= 2000 MDL",
    searchResult.listings.length > 0 && overPriced.length === 0,
    overPriced.length === 0
      ? `all ${searchResult.listings.length} listings <= 2000 MDL`
      : `${overPriced.length} listings over budget, e.g. id ${overPriced[0]?.id} price ${JSON.stringify(overPriced[0]?.price)}`
  );

  console.log("\n=== diagnostics ===");
  console.log(JSON.stringify(searchResult.diagnostics, null, 1));
  console.log("count:", JSON.stringify(searchResult.count));

  check(
    "b. diagnostics.pagesFetched >= 1",
    searchResult.diagnostics.pagesFetched >= 1,
    `pagesFetched = ${searchResult.diagnostics.pagesFetched}`
  );

  check(
    "b. count.serverTotal > count.returned",
    searchResult.count.serverTotal > searchResult.count.returned,
    `serverTotal = ${searchResult.count.serverTotal}, returned = ${searchResult.count.returned}`
  );

  const d = searchResult.diagnostics;
  const summed = d.matched + d.droppedNoPrice + d.droppedIntent + d.droppedRegion + d.droppedPrice + d.droppedMalformed;
  check(
    "b. fetched === matched + droppedNoPrice + droppedIntent + droppedRegion + droppedPrice + droppedMalformed",
    d.fetched === summed,
    `fetched=${d.fetched}, sum=${summed} (matched=${d.matched}, droppedNoPrice=${d.droppedNoPrice}, droppedIntent=${d.droppedIntent}, droppedRegion=${d.droppedRegion}, droppedPrice=${d.droppedPrice}, droppedMalformed=${d.droppedMalformed})`
  );

  const zeroPriced = searchResult.listings.filter((l) => l.price.mdl === 0);
  check(
    "c. no listing has price.mdl === 0",
    zeroPriced.length === 0,
    zeroPriced.length === 0 ? "confirmed across all returned listings" : `${zeroPriced.length} listings had price.mdl === 0, e.g. id ${zeroPriced[0]?.id}`
  );

  // ---------------------------------------------------------------------
  // d + e: get_listing_999 on an id from the search results above
  // ---------------------------------------------------------------------
  console.log("\n=== get_listing_999 ===");
  // Prefer a listing search flagged as truncated: that guarantees the underlying
  // description is > 300 chars, which is the case that actually proves get_listing
  // does NOT truncate.
  const truncatedCandidate = searchResult.listings.find((l) => l.descriptionTruncated);
  const targetListing: Listing | undefined = truncatedCandidate ?? searchResult.listings[0];

  if (!targetListing) {
    check("d. get_listing_999 fetch", false, "no search result available to fetch");
  } else {
    console.log(`fetching id ${targetListing.id} (search description was ${targetListing.descriptionTruncated ? "truncated" : "not truncated"})`);
    const full = await getListing({ id: targetListing.id });

    check(
      "d. get_listing_999 returns phones",
      Array.isArray(full.phones) && full.phones.length > 0,
      `phones = ${JSON.stringify(full.phones)}`
    );

    if (truncatedCandidate) {
      check(
        "d. full description exceeds 300 chars (proves no truncation)",
        full.description.length > 300,
        `description.length = ${full.description.length}, descriptionTruncated = ${full.descriptionTruncated}`
      );
    } else {
      check(
        "d. full description length (no truncated candidate found in result set)",
        true,
        `best-effort: description.length = ${full.description.length} (no listing in this result set had descriptionTruncated=true to prove against; skipping as inconclusive rather than failing)`
      );
    }

    console.log("\n=== images ===");
    const images = full.images ?? [];
    const allFullUrls = images.length > 0 && images.every((u) => /^https?:\/\//.test(u));
    check(
      "e. images are full URLs",
      allFullUrls,
      `${images.length} images, e.g. ${images[0] ?? "(none)"}`
    );

    if (images.length > 0) {
      const imgUrl = images[0];
      try {
        const res = await fetch(imgUrl, { method: "GET" });
        const contentType = res.headers.get("content-type") ?? "";
        check(
          "e. first image resolves 200 with image content-type",
          res.ok && contentType.startsWith("image/"),
          `GET ${imgUrl} -> HTTP ${res.status}, content-type: ${contentType}`
        );
      } catch (err) {
        check("e. first image resolves 200 with image content-type", false, `fetch threw: ${String(err)}`);
      }
    } else {
      check("e. first image resolves 200 with image content-type", false, "no images to fetch");
    }
  }

  // ---------------------------------------------------------------------
  // f: list_categories_999
  // ---------------------------------------------------------------------
  console.log("\n=== list_categories_999 ===");
  const categories = await listCategories();
  check(
    "f. list_categories_999 returns a non-empty tree",
    categories.length > 0,
    `${categories.length} top-level categories, e.g. ${categories[0]?.title ?? "(none)"}`
  );

  // ---------------------------------------------------------------------
  // Summary
  // ---------------------------------------------------------------------
  console.log("\n=== SUMMARY ===");
  const failed = results.filter((r) => !r.pass);
  for (const r of results) {
    console.log(`${r.pass ? "PASS" : "FAIL"} - ${r.name}`);
  }
  console.log(`\n${results.length - failed.length}/${results.length} checks passed.`);

  if (failed.length > 0) {
    console.error(`\n${failed.length} check(s) FAILED.`);
    process.exit(1);
  } else {
    console.log("\nAll checks PASSED.");
  }
}

main().catch((err) => {
  console.error("Verification script crashed:", err);
  process.exit(1);
});
