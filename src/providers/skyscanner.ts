import type {
  IFlightProvider,
  NormalizedFlight,
  ExploreResult,
  SearchParams,
  ExploreParams,
} from "./provider.js";
import { RateLimiter } from "../utils/rate-limiter.js";

const RAPIDAPI_HOST = "sky-scrapper.p.rapidapi.com";
const BASE_URL = `https://${RAPIDAPI_HOST}`;

export class SkyscannerProvider implements IFlightProvider {
  readonly name = "skyscanner" as const;
  private readonly apiKey: string;
  private readonly limiter = new RateLimiter(3, 1); // 3 tokens, 1/sec refill

  constructor(apiKey: string) {
    this.apiKey = apiKey;
  }

  isAvailable(): boolean {
    return this.apiKey.length > 0;
  }

  async searchFlights(params: SearchParams): Promise<NormalizedFlight[]> {
    await this.limiter.acquire();

    const query = new URLSearchParams({
      originSkyId: params.origin,
      destinationSkyId: params.destination,
      originEntityId: "",
      destinationEntityId: "",
      date: params.date_from,
      cabinClass: "economy",
      adults: String(params.passengers),
      currency: "PLN",
      market: "PL",
      countryCode: "PL",
      sortBy: "best",
    });

    if (params.return_date_from) {
      query.set("returnDate", params.return_date_from);
    }

    const resp = await fetch(
      `${BASE_URL}/api/v2/flights/searchFlightsWebComplete?${query}`,
      {
        headers: {
          "X-RapidAPI-Key": this.apiKey,
          "X-RapidAPI-Host": RAPIDAPI_HOST,
        },
      }
    );

    if (!resp.ok) {
      throw new Error(`Skyscanner API error: ${resp.status} ${resp.statusText}`);
    }

    const data = (await resp.json()) as SkyscannerSearchResponse;
    return this.parseSearchResults(data, params);
  }

  async exploreDestinations(params: ExploreParams): Promise<ExploreResult[]> {
    await this.limiter.acquire();

    const query = new URLSearchParams({
      originSkyId: params.origin,
      travelDate: params.date_from,
      currency: "PLN",
    });

    const resp = await fetch(
      `${BASE_URL}/api/v1/flights/searchFlightEverywhere?${query}`,
      {
        headers: {
          "X-RapidAPI-Key": this.apiKey,
          "X-RapidAPI-Host": RAPIDAPI_HOST,
        },
      }
    );

    if (!resp.ok) {
      throw new Error(`Skyscanner API error: ${resp.status} ${resp.statusText}`);
    }

    const data = (await resp.json()) as SkyscannerExploreResponse;
    return this.parseExploreResults(data, params);
  }

  private parseSearchResults(
    data: SkyscannerSearchResponse,
    params: SearchParams
  ): NormalizedFlight[] {
    const results: NormalizedFlight[] = [];
    const context = data.data?.context;
    const itineraries = data.data?.itineraries;

    if (!itineraries) return results;

    // Build lookup maps from context
    const places = new Map<string, SkyscannerPlace>();
    for (const p of context?.places ?? []) {
      places.set(p.entityId, p);
    }
    const carriers = new Map<string, SkyscannerCarrier>();
    for (const c of context?.carriers ?? []) {
      carriers.set(String(c.id), c);
    }

    const buckets = [
      ...(itineraries.buckets ?? []),
    ];

    for (const bucket of buckets) {
      for (const item of bucket.items ?? []) {
        const leg = item.legs?.[0];
        if (!leg) continue;

        const segment = leg.segments?.[0];
        const carrier = segment
          ? carriers.get(String(segment.marketingCarrierId))
          : undefined;

        const originPlace = places.get(leg.originPlaceId ?? "");
        const destPlace = places.get(leg.destinationPlaceId ?? "");

        const flight: NormalizedFlight = {
          id: `skyscanner-${item.id ?? leg.id ?? ""}`,
          source: "skyscanner",
          airline: carrier?.name ?? segment?.marketingCarrier?.name ?? "Unknown",
          airline_code: carrier?.alternateId ?? segment?.marketingCarrier?.alternateId ?? "",
          flight_number: segment
            ? `${segment.marketingCarrier?.alternateId ?? ""}${segment.flightNumber ?? ""}`
            : "",
          origin: originPlace?.iata ?? leg.originStationCode ?? params.origin,
          destination: destPlace?.iata ?? leg.destinationStationCode ?? params.destination,
          departure_time: leg.departure ?? "",
          arrival_time: leg.arrival ?? "",
          duration_minutes: leg.durationInMinutes ?? 0,
          stops: leg.stopCount ?? 0,
          price: item.price?.raw ?? 0,
          currency: "PLN",
          deep_link: item.deeplink ?? undefined,
          cabin_class: "economy",
          baggage_included: false,
        };

        if (params.max_price && flight.price > params.max_price) continue;
        if (flight.stops > params.max_stops) continue;

        results.push(flight);
      }
    }

    return results;
  }

  private parseExploreResults(
    data: SkyscannerExploreResponse,
    params: ExploreParams
  ): ExploreResult[] {
    const results: ExploreResult[] = [];
    const items = data.data ?? [];

    for (const item of items) {
      if (params.max_price && (item.Payload?.Price ?? 0) > params.max_price) continue;

      results.push({
        destination: item.Meta?.CountryId ?? "",
        destination_name: item.Meta?.CountryNameEnglish ?? "",
        price: item.Payload?.Price ?? 0,
        currency: item.Payload?.CurrencyId ?? "PLN",
        departure_date: params.date_from,
        return_date: params.date_to,
        source: "skyscanner",
      });

      if (results.length >= params.limit) break;
    }

    return results;
  }
}

// --- Skyscanner API response types ---

interface SkyscannerPlace {
  entityId: string;
  iata?: string;
  name?: string;
}

interface SkyscannerCarrier {
  id: string | number;
  name?: string;
  alternateId?: string;
}

interface SkyscannerSegment {
  marketingCarrierId?: number;
  flightNumber?: string;
  marketingCarrier?: {
    name?: string;
    alternateId?: string;
  };
}

interface SkyscannerLeg {
  id?: string;
  originPlaceId?: string;
  destinationPlaceId?: string;
  originStationCode?: string;
  destinationStationCode?: string;
  departure?: string;
  arrival?: string;
  durationInMinutes?: number;
  stopCount?: number;
  segments?: SkyscannerSegment[];
}

interface SkyscannerItineraryItem {
  id?: string;
  price?: { raw?: number; formatted?: string };
  legs?: SkyscannerLeg[];
  deeplink?: string;
}

interface SkyscannerBucket {
  items?: SkyscannerItineraryItem[];
}

interface SkyscannerSearchResponse {
  data?: {
    context?: {
      places?: SkyscannerPlace[];
      carriers?: SkyscannerCarrier[];
    };
    itineraries?: {
      buckets?: SkyscannerBucket[];
    };
  };
}

interface SkyscannerExploreItem {
  Meta?: {
    CountryId?: string;
    CountryNameEnglish?: string;
  };
  Payload?: {
    Price?: number;
    CurrencyId?: string;
  };
}

interface SkyscannerExploreResponse {
  data?: SkyscannerExploreItem[];
}
