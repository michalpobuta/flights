import type {
  IFlightProvider,
  NormalizedFlight,
  ExploreResult,
  SearchParams,
  ExploreParams,
  FlightSource,
} from "../providers/provider.js";
import { TTLCache } from "./cache.js";

export class FlightAggregator {
  private readonly providers: IFlightProvider[];
  private readonly cache = new TTLCache(300); // 5 min

  constructor(providers: IFlightProvider[]) {
    this.providers = providers;
  }

  async searchFlights(
    params: SearchParams,
    sourcesFilter?: FlightSource[]
  ): Promise<NormalizedFlight[]> {
    const cacheKey = this.cache.buildKey("search", params, sourcesFilter);
    const cached = this.cache.get<NormalizedFlight[]>(cacheKey);
    if (cached) return cached;

    const active = this.getActiveProviders(sourcesFilter);
    const results = await Promise.allSettled(
      active.map((p) => p.searchFlights(params))
    );

    const flights: NormalizedFlight[] = [];
    const errors: string[] = [];

    for (let i = 0; i < results.length; i++) {
      const result = results[i];
      if (result.status === "fulfilled") {
        flights.push(...result.value);
      } else {
        errors.push(`${active[i].name}: ${result.reason}`);
      }
    }

    if (errors.length > 0) {
      console.error("Provider errors:", errors);
    }

    const deduped = this.deduplicate(flights);
    const sorted = deduped.sort((a, b) => {
      if (a.price !== b.price) return a.price - b.price;
      return a.duration_minutes - b.duration_minutes;
    });

    this.cache.set(cacheKey, sorted);
    return sorted;
  }

  async exploreDestinations(
    params: ExploreParams,
    sourcesFilter?: FlightSource[]
  ): Promise<ExploreResult[]> {
    const cacheKey = this.cache.buildKey("explore", params, sourcesFilter);
    const cached = this.cache.get<ExploreResult[]>(cacheKey);
    if (cached) return cached;

    const active = this.getActiveProviders(sourcesFilter).filter(
      (p) => p.exploreDestinations
    );

    const results = await Promise.allSettled(
      active.map((p) => p.exploreDestinations!(params))
    );

    const destinations: ExploreResult[] = [];
    for (const result of results) {
      if (result.status === "fulfilled") {
        destinations.push(...result.value);
      }
    }

    // Deduplicate by destination, keep cheapest
    const byDest = new Map<string, ExploreResult>();
    for (const d of destinations) {
      const existing = byDest.get(d.destination);
      if (!existing || d.price < existing.price) {
        byDest.set(d.destination, d);
      }
    }

    const sorted = [...byDest.values()]
      .sort((a, b) => a.price - b.price)
      .slice(0, params.limit);

    this.cache.set(cacheKey, sorted);
    return sorted;
  }

  private getActiveProviders(
    filter?: FlightSource[]
  ): IFlightProvider[] {
    return this.providers.filter((p) => {
      if (!p.isAvailable()) return false;
      if (filter && filter.length > 0 && !filter.includes(p.name))
        return false;
      return true;
    });
  }

  private deduplicate(flights: NormalizedFlight[]): NormalizedFlight[] {
    const seen = new Map<string, NormalizedFlight>();

    for (const f of flights) {
      // Key: airline + flight_number + departure date
      const depDate = f.departure_time.slice(0, 10);
      const key = `${f.airline_code}-${f.flight_number}-${depDate}-${f.origin}-${f.destination}`;

      const existing = seen.get(key);
      if (!existing || f.price < existing.price) {
        seen.set(key, f);
      }
    }

    return [...seen.values()];
  }
}
