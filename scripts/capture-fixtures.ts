import { writeFileSync, mkdirSync } from "node:fs";

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
  "(KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

const QUERY = `query SearchAds($input: Ads_SearchInput!) {
  searchAds(input: $input) { count ads {
    id title posted
    price: feature(id: 2) { value }
    region: feature(id: 7) { value }
    body: feature(id: 13) { value }
    phoneNumbers: feature(id: 16) { value }
    condition: feature(id: 593) { value }
  } }
}`;

async function search(query: string) {
  const r = await fetch("https://999.md/graphql", {
    method: "POST",
    headers: { "Content-Type": "application/json", "User-Agent": UA, Origin: "https://999.md" },
    body: JSON.stringify({
      operationName: "SearchAds",
      variables: { input: { source: "AD_SOURCE_DESKTOP_REDESIGN", sort: "SORT_ADS_DATE_DESC", pagination: { limit: 78, skip: 0 }, filters: [], query } },
      query: QUERY,
    }),
  });
  return (await r.json())?.data?.searchAds ?? { count: 0, ads: [] };
}

(async () => {
  mkdirSync("tests/fixtures", { recursive: true });
  // Deliberately bilingual: a Romanian-only fixture set would hide half the bugs.
  for (const [name, q] of [
    ["ro", "televizor"],
    ["ru", "телевизор"],
    ["mixed", "smart tv"],
  ] as const) {
    const data = await search(q);
    writeFileSync(`tests/fixtures/search-${name}.json`, JSON.stringify(data, null, 1));
    console.log(name, "->", data.ads.length, "ads");
    await new Promise((r) => setTimeout(r, 500));
  }
})();
