import type {
  IFlightProvider,
  NormalizedFlight,
  SearchParams,
} from "./provider.js";
import { RateLimiter } from "../utils/rate-limiter.js";

const BASE_URL = "https://api.flightapi.io";

export class FlightAPIProvider implements IFlightProvider {
  readonly name = "flightapi" as const;
  private readonly apiKey: string;
  private readonly limiter = new RateLimiter(2, 0.5); // 2 tokens, 0.5/sec refill

  constructor(apiKey: string) {
    this.apiKey = apiKey;
  }

  isAvailable(): boolean {
    return this.apiKey.length > 0;
  }

  async searchFlights(params: SearchParams): Promise<NormalizedFlight[]> {
    await this.limiter.acquire();

    const adults = params.passengers;
    const children = 0;
    const infants = 0;
    const cabinClass = "Economy";
    const currency = "PLN";

    let url: string;
    if (params.return_date_from) {
      url = `${BASE_URL}/roundtrip/${this.apiKey}/${params.origin}/${params.destination}/${params.date_from}/${params.return_date_from}/${adults}/${children}/${infants}/${cabinClass}/${currency}`;
    } else {
      url = `${BASE_URL}/onewaytrip/${this.apiKey}/${params.origin}/${params.destination}/${params.date_from}/${adults}/${children}/${infants}/${cabinClass}/${currency}`;
    }

    const resp = await fetch(url);

    if (!resp.ok) {
      throw new Error(`FlightAPI error: ${resp.status} ${resp.statusText}`);
    }

    const data = (await resp.json()) as FlightAPIResponse;
    return this.parseResults(data, params);
  }

  // FlightAPI.io does not support explore destinations
  // exploreDestinations is not implemented

  private parseResults(
    data: FlightAPIResponse,
    params: SearchParams
  ): NormalizedFlight[] {
    const results: NormalizedFlight[] = [];

    // Build lookup maps
    const placesMap = new Map<string, FlightAPIPlace>();
    for (const p of data.places ?? []) {
      placesMap.set(String(p.id), p);
    }

    const carriersMap = new Map<string, FlightAPICarrier>();
    for (const c of data.carriers ?? []) {
      carriersMap.set(String(c.id), c);
    }

    const legsMap = new Map<string, FlightAPILeg>();
    for (const leg of data.legs ?? []) {
      legsMap.set(leg.id, leg);
    }

    const segmentsMap = new Map<string, FlightAPISegment>();
    for (const seg of data.segments ?? []) {
      segmentsMap.set(seg.id, seg);
    }

    for (const itin of data.itineraries ?? []) {
      const pricingOption = itin.pricing_options?.[0];
      if (!pricingOption) continue;

      const price = pricingOption.price?.amount ?? 0;
      // FlightAPI returns price in minor units (cents/grosze) — divide by 1000
      const priceNormalized = price > 1000 ? Math.round(price / 1000) : price;

      if (params.max_price && priceNormalized > params.max_price) continue;

      const legId = itin.leg_ids?.[0];
      const leg = legId ? legsMap.get(legId) : undefined;

      if (leg && leg.stop_count > params.max_stops) continue;

      const segmentId = leg?.segment_ids?.[0];
      const segment = segmentId ? segmentsMap.get(segmentId) : undefined;

      const carrierId = segment?.marketing_carrier_id;
      const carrier = carrierId
        ? carriersMap.get(String(carrierId))
        : undefined;

      const originPlace = leg?.origin_place_id
        ? placesMap.get(String(leg.origin_place_id))
        : undefined;
      const destPlace = leg?.destination_place_id
        ? placesMap.get(String(leg.destination_place_id))
        : undefined;

      const deepLink = pricingOption.items?.[0]?.url ?? undefined;

      results.push({
        id: `flightapi-${itin.id ?? ""}`,
        source: "flightapi",
        airline: carrier?.name ?? "Unknown",
        airline_code: carrier?.alt_id ?? "",
        flight_number: segment
          ? `${carrier?.alt_id ?? ""}${segment.marketing_flight_number ?? ""}`
          : "",
        origin: originPlace?.alt_id ?? params.origin,
        destination: destPlace?.alt_id ?? params.destination,
        departure_time: leg?.departure ?? "",
        arrival_time: leg?.arrival ?? "",
        duration_minutes: leg?.duration ?? 0,
        stops: leg?.stop_count ?? 0,
        price: priceNormalized,
        currency: "PLN",
        deep_link: deepLink,
        cabin_class: "economy",
        baggage_included: false,
      });
    }

    return results;
  }
}

// --- FlightAPI.io response types ---

interface FlightAPIPlace {
  id: number | string;
  alt_id?: string;
  name?: string;
}

interface FlightAPICarrier {
  id: number | string;
  alt_id?: string;
  name?: string;
}

interface FlightAPISegment {
  id: string;
  marketing_carrier_id?: number;
  marketing_flight_number?: string;
}

interface FlightAPILeg {
  id: string;
  origin_place_id?: number;
  destination_place_id?: number;
  departure?: string;
  arrival?: string;
  duration?: number;
  stop_count: number;
  segment_ids?: string[];
}

interface FlightAPIPricingOption {
  price?: { amount?: number };
  items?: Array<{ url?: string }>;
}

interface FlightAPIItinerary {
  id?: string;
  leg_ids?: string[];
  pricing_options?: FlightAPIPricingOption[];
}

interface FlightAPIResponse {
  itineraries?: FlightAPIItinerary[];
  legs?: FlightAPILeg[];
  segments?: FlightAPISegment[];
  places?: FlightAPIPlace[];
  carriers?: FlightAPICarrier[];
}
