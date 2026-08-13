import type { Transport } from "./transport.js";
import type { Rates } from "./types.js";

/** Observed 2026-08-13. Emergency fallback only — these drift. */
export const FALLBACK_RATES: Rates = { MDL: 1, EUR: 19.9997, USD: 17.3383 };

const QUERY = `query MainRates {
  getMainCurrenciesRates { mainCurrenciesRates { key ratios { key value } } }
}`;

interface RatesPayload {
  getMainCurrenciesRates?: {
    mainCurrenciesRates?: Array<{ key: string; ratios?: Array<{ key: string; value: number }> }>;
  };
}

export interface RatesProvider {
  get(): Promise<{ rates: Rates; warnings: string[] }>;
}

export function createRates(transport: Transport): RatesProvider {
  let cached: { rates: Rates; warnings: string[] } | null = null;

  return {
    async get() {
      if (cached) return cached;
      try {
        const data = await transport.gql<RatesPayload>({
          operationName: "MainRates",
          query: QUERY,
          variables: {},
        });
        const rows = data?.getMainCurrenciesRates?.mainCurrenciesRates ?? [];
        const rates: Rates = { ...FALLBACK_RATES, MDL: 1 };
        for (const row of rows) {
          const toMdl = row.ratios?.find((r) => r.key === "RATES_MAIN_CURRENCY_MDL")?.value;
          if (!Number.isFinite(toMdl)) continue;
          if (row.key === "RATES_MAIN_CURRENCY_EUR") rates.EUR = toMdl as number;
          if (row.key === "RATES_MAIN_CURRENCY_USD") rates.USD = toMdl as number;
        }
        cached = { rates, warnings: [] };
      } catch (err) {
        cached = {
          rates: FALLBACK_RATES,
          warnings: [
            `Could not fetch live currency rates (${String(err)}); using hardcoded fallback from 2026-08-13. Non-MDL prices may be inaccurate.`,
          ],
        };
      }
      return cached;
    },
  };
}
