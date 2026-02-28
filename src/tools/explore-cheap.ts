import { z } from "zod";
import type { FlightAggregator } from "../services/aggregator.js";
import { formatExploreTable } from "../utils/formatting.js";

export const exploreSchema = z.object({
  origin: z
    .string()
    .default("KRK")
    .describe("IATA airport code for departure (default: KRK)"),
  date_from: z
    .string()
    .describe("Start of date range YYYY-MM-DD"),
  date_to: z
    .string()
    .describe("End of date range YYYY-MM-DD"),
  max_price: z
    .number()
    .optional()
    .describe("Maximum budget in PLN"),
  nights_min: z
    .number()
    .default(2)
    .describe("Minimum nights at destination"),
  nights_max: z
    .number()
    .default(7)
    .describe("Maximum nights at destination"),
  limit: z
    .number()
    .default(15)
    .describe("Number of results to return"),
});

export type ExploreInput = z.infer<typeof exploreSchema>;

export async function handleExplore(
  input: ExploreInput,
  aggregator: FlightAggregator
): Promise<string> {
  const results = await aggregator.exploreDestinations({
    origin: input.origin,
    date_from: input.date_from,
    date_to: input.date_to,
    max_price: input.max_price,
    nights_min: input.nights_min,
    nights_max: input.nights_max,
    limit: input.limit,
  });

  return formatExploreTable(results);
}
