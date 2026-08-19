import type { Transport } from "../transport.js";

export interface CategoryNode {
  id: string;
  title: string;
  children?: CategoryNode[];
}

export const LIST_CATEGORIES_TOOL_DESCRIPTION =
  "List 999.md categories. Best-effort: returns an empty array if the request fails for any reason.";

/**
 * Shape confirmed by Task 2's spike. Three things differ from the obvious guess:
 *   - `title` is a plain `String!`, NOT a `{ translated }` object.
 *   - The child field is `subcategoriesWithCounters`, NOT `children`.
 *   - The response type wraps the list in a field with the SAME name as the
 *     query field, so the payload path is `categoriesWithCounters.categoriesWithCounters`.
 * Input is `Ads_CategoriesWithCountersInput` with every field optional; `{}` is valid.
 */
const GQL = `query Cats999($input: Ads_CategoriesWithCountersInput) {
  categoriesWithCounters(input: $input) {
    categoriesWithCounters {
      id title url count
      subcategoriesWithCounters { id title url count }
    }
  }
}`;

interface RawCat {
  id?: string | number;
  title?: string | null;
  subcategoriesWithCounters?: RawCat[] | null;
}

function toNode(c: RawCat): CategoryNode {
  const kids = c.subcategoriesWithCounters ?? [];
  return {
    id: String(c.id ?? ""),
    title: c.title ?? "",
    ...(kids.length ? { children: kids.map(toNode) } : {}),
  };
}

export function createListCategories(deps: { transport: Transport }) {
  return async function listCategories(): Promise<CategoryNode[]> {
    try {
      const data = await deps.transport.gql<{
        categoriesWithCounters?: { categoriesWithCounters?: RawCat[] };
      }>({
        operationName: "Cats999",
        query: GQL,
        variables: { input: {} },
      });
      return (data?.categoriesWithCounters?.categoriesWithCounters ?? []).map(toNode);
    } catch (err) {
      // Documented as best-effort; an unavailable category tree must not break the server.
      // Log to stderr (not stdout) so stdio protocol is not polluted.
      console.error(
        `[list_categories_999] Request failed, returning empty array. Error: ${err instanceof Error ? err.message : String(err)}`
      );
      return [];
    }
  };
}
