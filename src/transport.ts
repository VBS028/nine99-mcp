export const GRAPHQL_URL = "https://999.md/graphql";

/**
 * Chrome UA is deliberate: it is the only configuration verified to work
 * against this endpoint. See the spec's Approach section.
 */
export const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
  "(KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

export interface GqlRequest {
  operationName: string;
  query: string;
  variables: unknown;
}

export interface TransportOptions {
  fetchImpl?: typeof fetch;
  minIntervalMs?: number;
  maxRetries?: number;
  timeoutMs?: number;
  backoffMs?: number;
}

export interface Transport {
  gql<T>(req: GqlRequest): Promise<T>;
}

export class GqlError extends Error {
  code?: string;
  constructor(message: string, code?: string) {
    super(message);
    this.name = "GqlError";
    this.code = code;
  }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export function createTransport(opts: TransportOptions = {}): Transport {
  const {
    fetchImpl = fetch,
    minIntervalMs = 300,
    maxRetries = 2,
    timeoutMs = 20_000,
    backoffMs = 500,
  } = opts;

  // Serialized queue: every request waits for the previous one, then for the
  // minimum interval. Bursts pace themselves instead of firing in parallel.
  let chain: Promise<unknown> = Promise.resolve();
  let lastStart = 0;

  async function once<T>(req: GqlRequest): Promise<T> {
    const wait = minIntervalMs - (Date.now() - lastStart);
    if (wait > 0) await sleep(wait);
    lastStart = Date.now();

    const ac = new AbortController();
    const timer = setTimeout(() => ac.abort(), timeoutMs);
    try {
      const res = await fetchImpl(GRAPHQL_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "User-Agent": USER_AGENT,
          "Accept-Language": "ro,ru;q=0.9",
          Origin: "https://999.md",
        },
        body: JSON.stringify(req),
        signal: ac.signal,
      });

      if (res.status === 429) throw new Error("HTTP 429");
      if (!res.ok) throw new Error(`HTTP ${res.status}`);

      const json = (await res.json()) as { data?: T; errors?: Array<{ message: string; extensions?: { code?: string } }> };
      if (json.errors?.length) {
        const first = json.errors[0];
        throw new GqlError(`999.md GraphQL error: ${first.message}`, first.extensions?.code);
      }
      return json.data as T;
    } finally {
      clearTimeout(timer);
    }
  }

  async function run<T>(req: GqlRequest): Promise<T> {
    let lastErr: unknown;
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        return await once<T>(req);
      } catch (err) {
        // A GraphQL-level error is a real answer, not a transient fault.
        if (err instanceof GqlError) throw err;
        lastErr = err;
        if (attempt < maxRetries) await sleep(backoffMs * (attempt + 1));
      }
    }
    // If the last error was a rate-limit, surface it as GqlError so callers can distinguish it.
    if (lastErr instanceof Error && lastErr.message === "HTTP 429") {
      throw new GqlError("999.md rate-limited the request (HTTP 429)", "RATE_LIMITED");
    }
    throw new Error(
      `999.md request "${req.operationName}" failed after ${maxRetries + 1} attempts: ${String(lastErr)}`
    );
  }

  return {
    gql<T>(req: GqlRequest): Promise<T> {
      const next = chain.then(() => run<T>(req));
      chain = next.catch(() => undefined);
      return next;
    },
  };
}
