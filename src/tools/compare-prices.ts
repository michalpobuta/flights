import { z } from "zod";
import type { FlightAggregator } from "../services/aggregator.js";
import { formatCompareTable } from "../utils/formatting.js";

export const compareSchema = z.object({
  origin: z
    .string()
    .default("KRK")
    .describe("IATA airport code for departure (default: KRK)"),
  destination: z.string().describe("IATA airport code for destination"),
  date: z.string().describe("Flight date YYYY-MM-DD"),
  return_date: z
    .string()
    .optional()
    .describe("Return date YYYY-MM-DD"),
});

export type CompareInput = z.infer<typeof compareSchema>;

export async function handleCompare(
  input: CompareInput,
  aggregator: FlightAggregator
): Promise<string> {
  // Query all sources for the same route
  const flights = await aggregator.searchFlights({
    origin: input.origin,
    destination: input.destination,
    date_from: input.date,
    return_date_from: input.return_date,
    passengers: 1,
    max_stops: 2,
  });

  return formatCompareTable(flights, input.origin, input.destination, input.date);
}
