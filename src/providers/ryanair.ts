import type {
  IFlightProvider,
  NormalizedFlight,
  ExploreResult,
  SearchParams,
  ExploreParams,
} from "./provider.js";
import { RateLimiter } from "../utils/rate-limiter.js";

const BASE_URL = "https://www.ryanair.com/api";

export class RyanairProvider implements IFlightProvider {
  readonly name = "ryanair" as const;
  private readonly limiter = new RateLimiter(3, 1); // Conservative for unofficial API

  isAvailable(): boolean {
    return true; // No API key needed
  }

  async searchFlights(params: SearchParams): Promise<NormalizedFlight[]> {
    await this.limiter.acquire();

    // Ryanair oneWayFares API
    const url = `${BASE_URL}/farfnd/v4/oneWayFares/${params.origin}/${params.destination}/cheapestPerDay?outboundMonthOfDate=${params.date_from}&currency=PLN`;

    const resp = await fetch(url, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
        Accept: "application/json",
      },
    });

    if (!resp.ok) {
      if (resp.status === 404) return []; // Route not served by Ryanair
      throw new Error(`Ryanair API error: ${resp.status}`);
    }

    const data = (await resp.json()) as RyanairFaresResponse;
    const results: NormalizedFlight[] = [];
    const targetDate = params.date_from;

    for (const fare of data.outbound?.fares ?? []) {
      if (!fare.price || !fare.departureDate) continue;
      const fareDate = fare.departureDate.slice(0, 10);

      // Filter to requested date range
      if (fareDate < params.date_from) continue;
      if (params.date_to && fareDate > params.date_to) continue;
      if (!params.date_to && fareDate !== targetDate) continue;

      if (params.max_price && fare.price.value > params.max_price) continue;

      results.push({
        id: `ryanair-${params.origin}-${params.destination}-${fareDate}`,
        source: "ryanair",
        airline: "Ryanair",
        airline_code: "FR",
        flight_number: `FR-${params.origin}-${params.destination}`,
        origin: params.origin,
        destination: params.destination,
        departure_time: fare.departureDate,
        arrival_time: fare.arrivalDate ?? fare.departureDate,
        duration_minutes: 0, // Not provided by this endpoint
        stops: 0, // Ryanair is point-to-point
        price: fare.price.value,
        currency: fare.price.currencyCode ?? "PLN",
        cabin_class: "economy",
        baggage_included: false,
      });
    }

    return results;
  }

  async exploreDestinations(params: ExploreParams): Promise<ExploreResult[]> {
    await this.limiter.acquire();

    const url = `${BASE_URL}/farfnd/v4/roundTripFares/${params.origin}/cheapestPerDay?outboundMonthOfDate=${params.date_from}&currency=PLN`;

    let resp: Response;
    try {
      resp = await fetch(url, {
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
          Accept: "application/json",
        },
      });
    } catch {
      return [];
    }

    if (!resp.ok) return [];

    const data = (await resp.json()) as RyanairRoundTripResponse;
    const results: ExploreResult[] = [];

    for (const fare of data.fares ?? []) {
      if (!fare.outbound?.price) continue;
      const totalPrice =
        fare.outbound.price.value + (fare.inbound?.price?.value ?? 0);

      if (params.max_price && totalPrice > params.max_price) continue;

      results.push({
        destination:
          fare.outbound.arrivalAirport?.iataCode ??
          fare.outbound.arrivalAirport?.name ??
          "Unknown",
        destination_name: fare.outbound.arrivalAirport?.name ?? "",
        price: totalPrice,
        currency: fare.outbound.price.currencyCode ?? "PLN",
        departure_date: fare.outbound.departureDate?.slice(0, 10) ?? "",
        return_date: fare.inbound?.departureDate?.slice(0, 10) ?? "",
        source: "ryanair",
      });
    }

    return results.sort((a, b) => a.price - b.price).slice(0, params.limit);
  }
}

interface RyanairFaresResponse {
  outbound: {
    fares: Array<{
      departureDate: string;
      arrivalDate?: string;
      price: { value: number; currencyCode: string } | null;
    }>;
  };
}

interface RyanairRoundTripResponse {
  fares: Array<{
    outbound: {
      departureDate: string;
      arrivalAirport: { iataCode: string; name: string };
      price: { value: number; currencyCode: string };
    };
    inbound?: {
      departureDate: string;
      price: { value: number; currencyCode: string };
    };
  }>;
}
