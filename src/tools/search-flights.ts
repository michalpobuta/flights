import { z } from "zod";
import type { FlightAggregator } from "../services/aggregator.js";
import type { FlightSource } from "../providers/provider.js";
import { formatFlightsTable } from "../utils/formatting.js";

export const searchFlightsSchema = z.object({
  origin: z
    .string()
    .default("KRK")
    .describe("IATA airport code for departure (default: KRK)"),
  destination: z.string().describe("IATA airport code for destination"),
  date_from: z
    .string()
    .describe("Departure date YYYY-MM-DD"),
  date_to: z
    .string()
    .optional()
    .describe("End of date range for flexible dates YYYY-MM-DD"),
  return_date_from: z
    .string()
    .optional()
    .describe("Return date YYYY-MM-DD"),
  return_date_to: z
    .string()
    .optional()
    .describe("End of return date range YYYY-MM-DD"),
  passengers: z.number().default(1).describe("Number of passengers"),
  max_stops: z.number().default(1).describe("Maximum number of stops"),
  max_price: z
    .number()
    .optional()
    .describe("Maximum price in PLN"),
  sources: z
    .array(z.enum(["kiwi", "amadeus", "serpapi", "ryanair", "skyscanner", "flightapi"]))
    .optional()
    .describe("Which providers to query (default: all available)"),
});

export type SearchFlightsInput = z.infer<typeof searchFlightsSchema>;

export async function handleSearchFlights(
  input: SearchFlightsInput,
  aggregator: FlightAggregator
): Promise<string> {
  const flights = await aggregator.searchFlights(
    {
      origin: input.origin,
      destination: input.destination,
      date_from: input.date_from,
      date_to: input.date_to,
      return_date_from: input.return_date_from,
      return_date_to: input.return_date_to,
      passengers: input.passengers,
      max_stops: input.max_stops,
      max_price: input.max_price,
    },
    input.sources as FlightSource[] | undefined
  );

  return formatFlightsTable(flights);
}
