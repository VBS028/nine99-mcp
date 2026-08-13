const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
  "(KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

const ENDPOINT = "https://999.md/graphql";

// Global constraint: minimum 300 ms between outbound requests. The brief's original
// script had zero delay between its 6 sequential awaits; this version enforces the
// floor (with margin) between every request below.
const DELAY_MS = 350;

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

async function gql(body: unknown): Promise<any> {
  const r = await fetch(ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/json", "User-Agent": UA, Origin: "https://999.md" },
    body: JSON.stringify(body),
  });
  return r.json();
}

async function typeFields(name: string) {
  const j = await gql({ query: `query { __type(name: "${name}") { kind inputFields { name type { name kind ofType { name kind } } } fields { name } enumValues { name } } }` });
  return j?.data?.__type ?? j?.errors;
}

// NOTE: the operation name inside the query document must match the top-level
// `operationName` sent with each request, or the server can't find the operation
// to run and silently returns no data for that field. Kept as one shared, aptly
// named document reused by both Q1 live calls below.
const SEARCH_QUERY = `query SpikeSearch999($input: Ads_SearchInput!) {
  searchAds(input: $input) { count ads { id title price: feature(id: 2) { value } } }
}`;

(async () => {
  // ---------------------------------------------------------------------
  // Q1: does `filters` support price/region/category server-side?
  // ---------------------------------------------------------------------
  console.log("Q1 Ads_SearchInput:", JSON.stringify(await typeFields("Ads_SearchInput"), null, 1));
  await sleep(DELAY_MS);

  // The brief guessed `Ads_SearchFilterInput` here, which resolves to null.
  // The real element type of Ads_SearchInput.filters is `Ads_FiltersValueInput`,
  // found via `__schema { types { name } }` filtered on /filter/i.
  console.log("Q1 Ads_FiltersValueInput:", JSON.stringify(await typeFields("Ads_FiltersValueInput"), null, 1));
  await sleep(DELAY_MS);

  console.log("Q1 Ads_FilterValueInput (nested `features` element type):", JSON.stringify(await typeFields("Ads_FilterValueInput"), null, 1));
  await sleep(DELAY_MS);

  // Live proof that server-side price filtering actually narrows results, not just
  // that the shape parses. Baseline vs. a price-range filter on feature 2.
  const baseline = await gql({
    operationName: "SpikeSearch999",
    variables: {
      input: {
        source: "AD_SOURCE_DESKTOP_REDESIGN",
        sort: "SORT_ADS_DATE_DESC",
        pagination: { limit: 3, skip: 0 },
        filters: [],
        query: "televizor",
      },
    },
    query: SEARCH_QUERY,
  });
  console.log(
    "Q1 baseline count (filters: []):",
    baseline?.data?.searchAds?.count,
    baseline?.errors ? "ERRORS: " + JSON.stringify(baseline.errors) : ""
  );
  await sleep(DELAY_MS);

  const filtered = await gql({
    operationName: "SpikeSearch999",
    variables: {
      input: {
        source: "AD_SOURCE_DESKTOP_REDESIGN",
        sort: "SORT_ADS_DATE_DESC",
        pagination: { limit: 3, skip: 0 },
        filters: [
          {
            filterId: 2,
            op: "AND",
            features: [{ featureId: 2, range: { min: 5000, max: 8000 }, unit: "UNIT_MDL" }],
          },
        ],
        query: "televizor",
      },
    },
    query: SEARCH_QUERY,
  });
  console.log(
    "Q1 filtered count (server-side price range 5000-8000 MDL, currency-aware via unit:UNIT_MDL):",
    filtered?.data?.searchAds?.count,
    "sample prices:",
    JSON.stringify(filtered?.data?.searchAds?.ads?.map((a: any) => a.price?.value)),
    filtered?.errors ? "ERRORS: " + JSON.stringify(filtered.errors) : ""
  );
  await sleep(DELAY_MS);

  // ---------------------------------------------------------------------
  // Q2: full list of valid `sort` enum values
  // ---------------------------------------------------------------------
  // The brief guessed `Ads_SortInput` here, which resolves to null. The real
  // enum type on Ads_SearchInput.sort is `Ads_Sort`.
  console.log("Q2 Ads_Sort enum:", JSON.stringify(await typeFields("Ads_Sort"), null, 1));
  await sleep(DELAY_MS);

  // ---------------------------------------------------------------------
  // Q3: does `advert` work unauthenticated?
  // ---------------------------------------------------------------------
  console.log("Q3 AdvertInput:", JSON.stringify(await typeFields("AdvertInput"), null, 1));
  await sleep(DELAY_MS);

  // A hardcoded ad id goes stale; pull a live one from a fresh search instead.
  const idLookup = await gql({
    operationName: "SpikeFindLiveAdId999",
    variables: {
      input: {
        source: "AD_SOURCE_DESKTOP_REDESIGN",
        sort: "SORT_ADS_DATE_DESC",
        pagination: { limit: 1, skip: 0 },
        filters: [],
        query: "televizor",
      },
    },
    query: `query SpikeFindLiveAdId999($input: Ads_SearchInput!) { searchAds(input: $input) { ads { id title } } }`,
  });
  const liveId = idLookup?.data?.searchAds?.ads?.[0]?.id;
  console.log("Q3 live ad id used for advert probe:", liveId);
  await sleep(DELAY_MS);

  // The brief's probe declared `$input: AdvertInput` (nullable), but the real field
  // signature is `advert(input: AdvertInput!)` (non-null) -- the nullable form throws
  // GRAPHQL_VALIDATION_FAILED, which looks like an auth error but isn't one. Fixed to
  // AdvertInput! below. Operation named distinctively (not `GetAdsByIds`-shaped) to
  // avoid the server-side persisted-query collision noted in the spec's appendix.
  const advert = await gql({
    operationName: "ProbeAdvertLookup999",
    variables: { input: { id: liveId } },
    query: `query ProbeAdvertLookup999($input: AdvertInput!) { advert(input: $input) { id title price: feature(id: 2) { value } phoneNumbers: feature(id: 16) { value } images: feature(id: 14) { value } } }`,
  });
  console.log("Q3 advert result (unauthenticated, non-null AdvertInput!):", JSON.stringify(advert).slice(0, 900));
  await sleep(DELAY_MS);

  // ---------------------------------------------------------------------
  // Q4: does `categoriesWithCounters` work unauthenticated, and what's its input shape?
  // ---------------------------------------------------------------------
  // The brief guessed `Categories_WithCountersInput` here, which resolves to null.
  // The real input type is `Ads_CategoriesWithCountersInput`.
  console.log("Q4 Ads_CategoriesWithCountersInput:", JSON.stringify(await typeFields("Ads_CategoriesWithCountersInput"), null, 1));
  await sleep(DELAY_MS);

  const categories = await gql({
    operationName: "ProbeCategoriesWithCounters999",
    variables: { input: {} },
    query: `query ProbeCategoriesWithCounters999($input: Ads_CategoriesWithCountersInput) { categoriesWithCounters(input: $input) { categoriesWithCounters { id title url count } } }`,
  });
  console.log("Q4 categoriesWithCounters result (unauthenticated, input: {}):", JSON.stringify(categories).slice(0, 900));
})();
