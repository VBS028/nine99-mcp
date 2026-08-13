const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
  "(KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

async function gql(body: unknown): Promise<any> {
  const r = await fetch("https://999.md/graphql", {
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

(async () => {
  console.log("Q1 Ads_SearchInput:", JSON.stringify(await typeFields("Ads_SearchInput"), null, 1));
  console.log("Q1 filter input types:", JSON.stringify(await typeFields("Ads_SearchFilterInput"), null, 1));
  console.log("Q2 sort enum:", JSON.stringify(await typeFields("Ads_SortInput"), null, 1));
  console.log("Q3 AdvertInput:", JSON.stringify(await typeFields("AdvertInput"), null, 1));

  const advert = await gql({
    operationName: "ProbeAdvert",
    variables: { input: { id: "104254352" } },
    query: `query ProbeAdvert($input: AdvertInput) { advert(input: $input) { id title price: feature(id: 2) { value } phoneNumbers: feature(id: 16) { value } images: feature(id: 14) { value } } }`,
  });
  console.log("Q3 advert result:", JSON.stringify(advert).slice(0, 900));

  console.log("Q4 categoriesWithCounters:", JSON.stringify(await typeFields("Categories_WithCountersInput"), null, 1));
})();
