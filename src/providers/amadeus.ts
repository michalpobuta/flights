import type {
  IFlightProvider,
  NormalizedFlight,
  SearchParams,
} from "./provider.js";
import { RateLimiter } from "../utils/rate-limiter.js";

const SANDBOX_URL = "https://test.api.amadeus.com";

export class AmadeusProvider implements IFlightProvider {
  readonly name = "amadeus" as const;
  private readonly clientId: string;
  private readonly clientSecret: string;
  private readonly limiter = new RateLimiter(5, 1);

  private accessToken = "";
  private tokenExpiry = 0;

  constructor(clientId: string, clientSecret: string) {
    this.clientId = clientId;
    this.clientSecret = clientSecret;
  }

  isAvailable(): boolean {
    return this.clientId.length > 0 && this.clientSecret.length > 0;
  }

  async searchFlights(params: SearchParams): Promise<NormalizedFlight[]> {
    await this.limiter.acquire();
    await this.ensureToken();

    const query = new URLSearchParams({
      originLocationCode: params.origin,
      destinationLocationCode: params.destination,
      departureDate: params.date_from,
      adults: String(params.passengers),
      max: "30",
      currencyCode: "PLN",
      nonStop: params.max_stops === 0 ? "true" : "false",
    });

    if (params.return_date_from) {
      query.set("returnDate", params.return_date_from);
    }

    if (params.max_price) {
      query.set("maxPrice", String(params.max_price));
    }

    const resp = await fetch(
      `${SANDBOX_URL}/v2/shopping/flight-offers?${query}`,
      {
        headers: { Authorization: `Bearer ${this.accessToken}` },
      }
    );

    if (!resp.ok) {
      const body = await resp.text();
      throw new Error(`Amadeus API error: ${resp.status} ${body}`);
    }

    const data = (await resp.json()) as AmadeusResponse;
    return (data.data ?? []).map((offer) => this.normalize(offer));
  }

  private async ensureToken(): Promise<void> {
    if (this.accessToken && Date.now() < this.tokenExpiry) return;

    const resp = await fetch(`${SANDBOX_URL}/v1/security/oauth2/token`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "client_credentials",
        client_id: this.clientId,
        client_secret: this.clientSecret,
      }),
    });

    if (!resp.ok) {
      throw new Error(`Amadeus OAuth error: ${resp.status}`);
    }

    const token = (await resp.json()) as {
      access_token: string;
      expires_in: number;
    };
    this.accessToken = token.access_token;
    // Refresh 60s before expiry
    this.tokenExpiry = Date.now() + (token.expires_in - 60) * 1000;
  }

  private normalize(offer: AmadeusOffer): NormalizedFlight {
    const seg0 = offer.itineraries?.[0]?.segments?.[0];
    const segments = offer.itineraries?.[0]?.segments ?? [];
    const lastSeg = segments[segments.length - 1];
    const price = parseFloat(offer.price?.total ?? "0");

    return {
      id: `amadeus-${offer.id}`,
      source: "amadeus",
      airline: seg0?.carrierCode ?? "Unknown",
      airline_code: seg0?.carrierCode ?? "",
      flight_number: seg0 ? `${seg0.carrierCode}${seg0.number}` : "",
      origin: seg0?.departure?.iataCode ?? "",
      destination: lastSeg?.arrival?.iataCode ?? "",
      departure_time: seg0?.departure?.at ?? "",
      arrival_time: lastSeg?.arrival?.at ?? "",
      duration_minutes: parseDuration(
        offer.itineraries?.[0]?.duration ?? "PT0H"
      ),
      stops: Math.max(0, segments.length - 1),
      price,
      currency: offer.price?.currency ?? "PLN",
      cabin_class:
        offer.travelerPricings?.[0]?.fareDetailsBySegment?.[0]?.cabin ??
        "ECONOMY",
      baggage_included:
        (offer.travelerPricings?.[0]?.fareDetailsBySegment?.[0]
          ?.includedCheckedBags?.quantity ?? 0) > 0,
    };
  }
}

function parseDuration(iso: string): number {
  // PT2H30M -> 150
  const match = iso.match(/PT(?:(\d+)H)?(?:(\d+)M)?/);
  if (!match) return 0;
  return (parseInt(match[1] ?? "0") * 60) + parseInt(match[2] ?? "0");
}

interface AmadeusOffer {
  id: string;
  price: { total: string; currency: string };
  itineraries: Array<{
    duration: string;
    segments: Array<{
      carrierCode: string;
      number: string;
      departure: { iataCode: string; at: string };
      arrival: { iataCode: string; at: string };
    }>;
  }>;
  travelerPricings: Array<{
    fareDetailsBySegment: Array<{
      cabin: string;
      includedCheckedBags: { quantity: number };
    }>;
  }>;
}

interface AmadeusResponse {
  data: AmadeusOffer[];
}
