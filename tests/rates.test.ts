import { describe, it, expect, vi } from "vitest";
import { createRates, FALLBACK_RATES } from "../src/rates.js";
import type { Transport } from "../src/transport.js";

const livePayload = {
  getMainCurrenciesRates: {
    mainCurrenciesRates: [
      { key: "RATES_MAIN_CURRENCY_EUR", ratios: [{ key: "RATES_MAIN_CURRENCY_MDL", value: 19.9997 }] },
      { key: "RATES_MAIN_CURRENCY_USD", ratios: [{ key: "RATES_MAIN_CURRENCY_MDL", value: 17.3383 }] },
    ],
  },
};

describe("rates", () => {
  it("reads live rates and reports no warnings", async () => {
    const t: Transport = { gql: vi.fn().mockResolvedValue(livePayload) };
    const { rates, warnings } = await createRates(t).get();
    expect(rates.MDL).toBe(1);
    expect(rates.EUR).toBeCloseTo(19.9997, 3);
    expect(rates.USD).toBeCloseTo(17.3383, 3);
    expect(warnings).toEqual([]);
  });

  it("caches so a second call issues no request", async () => {
    const gql = vi.fn().mockResolvedValue(livePayload);
    const provider = createRates({ gql });
    await provider.get();
    await provider.get();
    expect(gql).toHaveBeenCalledTimes(1);
  });

  it("falls back with a warning when the call fails", async () => {
    const t: Transport = { gql: vi.fn().mockRejectedValue(new Error("boom")) };
    const { rates, warnings } = await createRates(t).get();
    expect(rates).toEqual(FALLBACK_RATES);
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toMatch(/fallback/i);
  });
});
