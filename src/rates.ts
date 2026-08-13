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
  let inflight: Promise<{ rates: Rates; warnings: string[] }> | null = null;

  return {
    async get() {
      if (cached) return cached;
      if (inflight) return inflight;

      inflight = (async () => {
        try {
          const data = await transport.gql<RatesPayload>({
            operationName: "MainRates",
            query: QUERY,
            variables: {},
          });
          const rows = data?.getMainCurrenciesRates?.mainCurrenciesRates ?? [];
          let eur: number | undefined;
          let usd: number | undefined;
          const warnings: string[] = [];

          for (const row of rows) {
            const toMdl = row.ratios?.find((r) => r.key === "RATES_MAIN_CURRENCY_MDL")?.value;
            if (!Number.isFinite(toMdl)) continue;
            if (row.key === "RATES_MAIN_CURRENCY_EUR") eur = toMdl as number;
            if (row.key === "RATES_MAIN_CURRENCY_USD") usd = toMdl as number;
          }

          if (eur === undefined) {
            eur = FALLBACK_RATES.EUR;
            warnings.push(`EUR rate missing from live data; using fallback from 2026-08-13. Prices may be inaccurate.`);
          }
          if (usd === undefined) {
            usd = FALLBACK_RATES.USD;
            warnings.push(`USD rate missing from live data; using fallback from 2026-08-13. Prices may be inaccurate.`);
          }

          cached = { rates: { MDL: 1, EUR: eur, USD: usd }, warnings };
        } catch (err) {
          cached = {
            rates: { ...FALLBACK_RATES },
            warnings: [
              `Could not fetch live currency rates (${String(err)}); using hardcoded fallback from 2026-08-13. Non-MDL prices may be inaccurate.`,
            ],
          };
        }
        return cached;
      })();

      return inflight;
    },
  };
}
