import type {
  IFlightProvider,
  NormalizedFlight,
  SearchParams,
} from "./provider.js";
import { RateLimiter } from "../utils/rate-limiter.js";

const BASE_URL = "https://serpapi.com/search";

export class SerpAPIProvider implements IFlightProvider {
  readonly name = "serpapi" as const;
  private readonly apiKey: string;
  private readonly limiter = new RateLimiter(2, 0.5); // Conservative: 250/month budget

  constructor(apiKey: string) {
    this.apiKey = apiKey;
  }

  isAvailable(): boolean {
    return this.apiKey.length > 0;
  }

  async searchFlights(params: SearchParams): Promise<NormalizedFlight[]> {
    await this.limiter.acquire();

    const query = new URLSearchParams({
      engine: "google_flights",
      api_key: this.apiKey,
      departure_id: params.origin,
      arrival_id: params.destination,
      outbound_date: params.date_from,
      currency: "PLN",
      hl: "en",
      adults: String(params.passengers),
      stops: String(params.max_stops),
      type: params.return_date_from ? "1" : "2", // 1=round trip, 2=one way
    });

    if (params.return_date_from) {
      query.set("return_date", params.return_date_from);
    }

    const resp = await fetch(`${BASE_URL}?${query}`);

    if (!resp.ok) {
      throw new Error(`SerpAPI error: ${resp.status} ${resp.statusText}`);
    }

    const data = (await resp.json()) as SerpAPIResponse;
    const results: NormalizedFlight[] = [];

    for (const category of [
      data.best_flights ?? [],
      data.other_flights ?? [],
    ]) {
      for (const flight of category) {
        results.push(this.normalize(flight, params));
      }
    }

    return results;
  }

  private normalize(
    flight: SerpAPIFlight,
    params: SearchParams
  ): NormalizedFlight {
    const leg0 = flight.flights?.[0];
    const lastLeg = flight.flights?.[flight.flights.length - 1];

    return {
      id: `serpapi-${leg0?.flight_number ?? ""}-${params.date_from}`,
      source: "serpapi",
      airline: leg0?.airline ?? "Unknown",
      airline_code: leg0?.airline ?? "",
      flight_number: leg0?.flight_number ?? "",
      origin: leg0?.departure_airport?.id ?? params.origin,
      destination:
        lastLeg?.arrival_airport?.id ?? params.destination,
      departure_time: buildISOTime(
        params.date_from,
        leg0?.departure_airport?.time
      ),
      arrival_time: buildISOTime(
        params.date_from,
        lastLeg?.arrival_airport?.time
      ),
      duration_minutes: flight.total_duration ?? 0,
      stops: Math.max(0, (flight.flights?.length ?? 1) - 1),
      price: flight.price ?? 0,
      currency: "PLN",
      cabin_class: "economy",
      baggage_included: false,
    };
  }
}

function buildISOTime(date: string, time?: string): string {
  if (!time) return date;
  // time format from SerpAPI: "6:30 AM" or "14:30"
  return `${date}T${time}`;
}

interface SerpAPIFlight {
  flights: Array<{
    airline: string;
    flight_number: string;
    departure_airport: { id: string; time: string };
    arrival_airport: { id: string; time: string };
  }>;
  total_duration: number;
  price: number;
}

interface SerpAPIResponse {
  best_flights?: SerpAPIFlight[];
  other_flights?: SerpAPIFlight[];
}
