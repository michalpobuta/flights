export type FlightSource = "kiwi" | "amadeus" | "serpapi" | "ryanair" | "kiwi_rapid" | "flightapi";

export interface NormalizedFlight {
  id: string;
  source: FlightSource;
  airline: string;
  airline_code: string;
  flight_number: string;
  origin: string;
  destination: string;
  departure_time: string; // ISO 8601
  arrival_time: string; // ISO 8601
  duration_minutes: number;
  stops: number;
  price: number; // PLN
  currency: string;
  deep_link?: string;
  cabin_class: string;
  baggage_included: boolean;
}

export interface ExploreResult {
  destination: string;
  destination_name: string;
  price: number;
  currency: string;
  departure_date: string;
  return_date: string;
  source: FlightSource;
  deep_link?: string;
}

export interface SearchParams {
  origin: string;
  destination: string;
  date_from: string;
  date_to?: string;
  return_date_from?: string;
  return_date_to?: string;
  passengers: number;
  max_stops: number;
  max_price?: number;
}

export interface ExploreParams {
  origin: string;
  date_from: string;
  date_to: string;
  max_price?: number;
  nights_min: number;
  nights_max: number;
  limit: number;
}

export interface IFlightProvider {
  readonly name: FlightSource;
  searchFlights(params: SearchParams): Promise<NormalizedFlight[]>;
  exploreDestinations?(params: ExploreParams): Promise<ExploreResult[]>;
  isAvailable(): boolean;
}
