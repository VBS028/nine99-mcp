import { describe, it, expect, vi } from "vitest";
import { createListCategories } from "../src/tools/listCategories.js";
import type { Transport } from "../src/transport.js";

describe("list_categories_999", () => {
  it("flattens the API shape into id/title nodes", async () => {
    // Real shape: title is a plain string, children live under
    // `subcategoriesWithCounters`, and the list is nested inside a field of the
    // same name as the query field. All three confirmed by Task 2's spike.
    const transport: Transport = {
      gql: vi.fn().mockResolvedValue({
        categoriesWithCounters: {
          categoriesWithCounters: [
            {
              id: 1,
              title: "Electronică",
              url: "electronics",
              count: 100,
              subcategoriesWithCounters: [{ id: 12, title: "Televizoare", url: "tv", count: 40 }],
            },
          ],
        },
      }),
    };
    const cats = await createListCategories({ transport })();
    expect(cats[0]).toMatchObject({ id: "1", title: "Electronică" });
    expect(cats[0].children?.[0]).toMatchObject({ id: "12", title: "Televizoare" });
  });

  it("returns an empty array rather than throwing when the query is unavailable", async () => {
    const transport: Transport = { gql: vi.fn().mockRejectedValue(new Error("UNAUTHENTICATED")) };
    await expect(createListCategories({ transport })()).resolves.toEqual([]);
  });
});
