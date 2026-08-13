import { describe, it, expect } from "vitest";
import { emptyDiagnostics } from "../src/types.js";

describe("scaffold", () => {
  it("exposes a zeroed diagnostics object", () => {
    const d = emptyDiagnostics();
    expect(d.fetched).toBe(0);
    expect(d.returned).toBe(0);
    expect(d.pagesFetched).toBe(0);
  });
});
