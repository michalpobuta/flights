import type {
  IFlightProvider,
  NormalizedFlight,
  ExploreResult,
  SearchParams,
  ExploreParams,
} from "./provider.js";
import { RateLimiter } from "../utils/rate-limiter.js";

const RAPIDAPI_HOST = "kiwi-com-cheap-flights.p.rapidapi.com";
const BASE_URL = `https://${RAPIDAPI_HOST}`;

export class SkyscannerProvider implements IFlightProvider {
  readonly name = "kiwi_rapid" as const;
  private readonly apiKey: string;
  private readonly limiter = new RateLimiter(3, 1);

  constructor(apiKey: string) {
    this.apiKey = apiKey;
  }

  isAvailable(): boolean {
    return this.apiKey.length > 0;
  }

  async searchFlights(params: SearchParams): Promise<NormalizedFlight[]> {
    await this.limiter.acquire();

    const query = new URLSearchParams({
      source: params.origin,
      destination: params.destination,
      departure: params.date_from,
      currency: "PLN",
      adults: String(params.passengers),
    });

    const endpoint = params.return_date_from ? "round-trip" : "one-way";

    if (params.return_date_from) {
      query.set("return", params.return_date_from);
    }

    const resp = await fetch(`${BASE_URL}/${endpoint}?${query}`, {
      headers: {
        "X-RapidAPI-Key": this.apiKey,
        "X-RapidAPI-Host": RAPIDAPI_HOST,
      },
    });

    if (!resp.ok) {
      throw new Error(`Kiwi RapidAPI error: ${resp.status} ${resp.statusText}`);
    }

    const data = (await resp.json()) as KiwiRapidResponse;
    return this.parseItineraries(data, params);
  }

  async exploreDestinations(_params: ExploreParams): Promise<ExploreResult[]> {
    // This API doesn't have an explore/everywhere endpoint
    return [];
  }

  private parseItineraries(
    data: KiwiRapidResponse,
    params: SearchParams
  ): NormalizedFlight[] {
    const results: NormalizedFlight[] = [];

    for (const itin of data.itineraries ?? []) {
      const segments = itin.sector?.sectorSegments ?? [];
      if (segments.length === 0) continue;

      const firstSeg = segments[0].segment;
      const lastSeg = segments[segments.length - 1].segment;
      if (!firstSeg || !lastSeg) continue;

      const carrier = firstSeg.carrier;
      const price = parseFloat(itin.price?.amount ?? "0");

      if (params.max_price && price > params.max_price) continue;

      const stops = Math.max(0, segments.length - 1);
      if (stops > params.max_stops) continue;

      const durationSec = itin.sector?.duration ?? 0;

      const flight: NormalizedFlight = {
        id: `kiwi_rapid-${itin.id ?? itin.legacyId ?? ""}`,
        source: "kiwi_rapid",
        airline: carrier?.name ?? "Unknown",
        airline_code: carrier?.code ?? "",
        flight_number: carrier
          ? `${carrier.code}${firstSeg.code ?? ""}`
          : "",
        origin:
          firstSeg.source?.station?.code ?? params.origin,
        destination:
          lastSeg.destination?.station?.code ?? params.destination,
        departure_time: firstSeg.source?.utcTime ?? "",
        arrival_time: lastSeg.destination?.utcTime ?? "",
        duration_minutes: Math.round(durationSec / 60),
        stops,
        price,
        currency: "PLN",
        deep_link: this.buildDeepLink(itin),
        cabin_class:
          firstSeg.cabinClass?.toLowerCase() ?? "economy",
        baggage_included:
          (itin.bagsInfo?.includedHandBags ?? 0) > 0 ||
          (itin.bagsInfo?.includedCheckedBags ?? 0) > 0,
      };

      results.push(flight);
    }

    return results;
  }

  private buildDeepLink(itin: KiwiRapidItinerary): string | undefined {
    const booking = itin.bookingOptions?.edges?.[0]?.node;
    if (!booking?.bookingUrl) return undefined;
    return `https://www.kiwi.com${booking.bookingUrl}`;
  }
}

// --- Kiwi RapidAPI response types ---

interface KiwiRapidStation {
  code?: string;
  name?: string;
}

interface KiwiRapidLocation {
  localTime?: string;
  utcTime?: string;
  station?: KiwiRapidStation;
}

interface KiwiRapidCarrier {
  name?: string;
  code?: string;
}

interface KiwiRapidSegment {
  source?: KiwiRapidLocation;
  destination?: KiwiRapidLocation;
  duration?: number;
  type?: string;
  code?: string;
  carrier?: KiwiRapidCarrier;
  cabinClass?: string;
}

interface KiwiRapidSectorSegment {
  segment?: KiwiRapidSegment;
  layover?: unknown;
}

interface KiwiRapidSector {
  sectorSegments?: KiwiRapidSectorSegment[];
  duration?: number;
}

interface KiwiRapidBookingNode {
  bookingUrl?: string;
  token?: string;
}

interface KiwiRapidItinerary {
  id?: string;
  legacyId?: string;
  price?: { amount?: string };
  sector?: KiwiRapidSector;
  bagsInfo?: {
    includedCheckedBags?: number;
    includedHandBags?: number;
  };
  bookingOptions?: {
    edges?: Array<{ node?: KiwiRapidBookingNode }>;
  };
}

interface KiwiRapidResponse {
  itineraries?: KiwiRapidItinerary[];
}
