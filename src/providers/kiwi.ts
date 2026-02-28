import type {
  IFlightProvider,
  NormalizedFlight,
  ExploreResult,
  SearchParams,
  ExploreParams,
} from "./provider.js";
import { RateLimiter } from "../utils/rate-limiter.js";

const BASE_URL = "https://tequila-api.kiwi.com";

export class KiwiProvider implements IFlightProvider {
  readonly name = "kiwi" as const;
  private readonly apiKey: string;
  private readonly limiter = new RateLimiter(5, 2); // 5 tokens, 2/sec refill

  constructor(apiKey: string) {
    this.apiKey = apiKey;
  }

  isAvailable(): boolean {
    return this.apiKey.length > 0;
  }

  async searchFlights(params: SearchParams): Promise<NormalizedFlight[]> {
    await this.limiter.acquire();

    const query = new URLSearchParams({
      fly_from: params.origin,
      fly_to: params.destination,
      date_from: formatDate(params.date_from),
      date_to: formatDate(params.date_to ?? params.date_from),
      curr: "PLN",
      locale: "en",
      adults: String(params.passengers),
      max_stopovers: String(params.max_stops),
      limit: "30",
    });

    if (params.return_date_from) {
      query.set("return_from", formatDate(params.return_date_from));
      if (params.return_date_to) {
        query.set("return_to", formatDate(params.return_date_to));
      }
    }

    if (params.max_price) {
      query.set("price_to", String(params.max_price));
    }

    const resp = await fetch(`${BASE_URL}/v2/search?${query}`, {
      headers: { apikey: this.apiKey },
    });

    if (!resp.ok) {
      throw new Error(`Kiwi API error: ${resp.status} ${resp.statusText}`);
    }

    const data = (await resp.json()) as KiwiResponse;
    return (data.data ?? []).map((f) => this.normalize(f));
  }

  async exploreDestinations(params: ExploreParams): Promise<ExploreResult[]> {
    await this.limiter.acquire();

    const query = new URLSearchParams({
      fly_from: params.origin,
      fly_to: "anywhere",
      date_from: formatDate(params.date_from),
      date_to: formatDate(params.date_to),
      curr: "PLN",
      nights_in_dst_from: String(params.nights_min),
      nights_in_dst_to: String(params.nights_max),
      one_for_city: "1",
      limit: String(params.limit),
      sort: "price",
    });

    if (params.max_price) {
      query.set("price_to", String(params.max_price));
    }

    const resp = await fetch(`${BASE_URL}/v2/search?${query}`, {
      headers: { apikey: this.apiKey },
    });

    if (!resp.ok) {
      throw new Error(`Kiwi API error: ${resp.status} ${resp.statusText}`);
    }

    const data = (await resp.json()) as KiwiResponse;
    return (data.data ?? []).map((f) => ({
      destination: f.flyTo,
      destination_name: f.cityTo,
      price: f.price,
      currency: "PLN",
      departure_date: f.local_departure?.slice(0, 10) ?? "",
      return_date: f.local_arrival?.slice(0, 10) ?? "",
      source: "kiwi" as const,
      deep_link: f.deep_link,
    }));
  }

  private normalize(f: KiwiFlight): NormalizedFlight {
    const route0 = f.route?.[0];
    return {
      id: `kiwi-${f.id}`,
      source: "kiwi",
      airline: f.airlines?.join(", ") ?? route0?.airline ?? "Unknown",
      airline_code: route0?.airline ?? "",
      flight_number: route0 ? `${route0.airline}${route0.flight_no}` : "",
      origin: f.flyFrom,
      destination: f.flyTo,
      departure_time: f.local_departure ?? "",
      arrival_time: f.local_arrival ?? "",
      duration_minutes: Math.round((f.duration?.total ?? 0) / 60),
      stops: Math.max(0, (f.route?.length ?? 1) - 1),
      price: f.price,
      currency: "PLN",
      deep_link: f.deep_link,
      cabin_class: "economy",
      baggage_included: (f.bags_price?.["1"] ?? 0) === 0,
    };
  }
}

function formatDate(isoDate: string): string {
  // Kiwi expects DD/MM/YYYY
  const [y, m, d] = isoDate.split("-");
  return `${d}/${m}/${y}`;
}

interface KiwiFlight {
  id: string;
  flyFrom: string;
  flyTo: string;
  cityTo: string;
  local_departure: string;
  local_arrival: string;
  price: number;
  airlines: string[];
  deep_link: string;
  duration: { total: number };
  route: Array<{
    airline: string;
    flight_no: number;
  }>;
  bags_price: Record<string, number>;
}

interface KiwiResponse {
  data: KiwiFlight[];
}
