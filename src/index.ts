import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { config } from "dotenv";

import { KiwiProvider } from "./providers/kiwi.js";
import { AmadeusProvider } from "./providers/amadeus.js";
import { SerpAPIProvider } from "./providers/serpapi.js";
import { RyanairProvider } from "./providers/ryanair.js";
import { SkyscannerProvider } from "./providers/skyscanner.js";
import { FlightAPIProvider } from "./providers/flightapi.js";
import { FlightAggregator } from "./services/aggregator.js";

import {
  searchFlightsSchema,
  handleSearchFlights,
} from "./tools/search-flights.js";
import { exploreSchema, handleExplore } from "./tools/explore-cheap.js";
import { compareSchema, handleCompare } from "./tools/compare-prices.js";

config();

// Initialize providers
const providers = [
  new KiwiProvider(process.env.KIWI_API_KEY ?? ""),
  new AmadeusProvider(
    process.env.AMADEUS_CLIENT_ID ?? "",
    process.env.AMADEUS_CLIENT_SECRET ?? ""
  ),
  new SerpAPIProvider(process.env.SERPAPI_KEY ?? ""),
  new RyanairProvider(),
  new SkyscannerProvider(process.env.RAPIDAPI_KEY ?? ""),
  new FlightAPIProvider(process.env.FLIGHTAPI_KEY ?? ""),
];

const aggregator = new FlightAggregator(providers);

// Create MCP server
const server = new McpServer({
  name: "flights",
  version: "1.0.0",
});

// Tool 1: search_flights
server.tool(
  "search_flights",
  "Search for flights from an airport (default: KRK Krakow) to a specific destination. Returns a list of flights sorted by price with details from multiple sources (Kiwi, Amadeus, Google Flights, Ryanair, Kiwi RapidAPI, FlightAPI).",
  searchFlightsSchema.shape,
  async (input) => {
    try {
      const text = await handleSearchFlights(input, aggregator);
      return { content: [{ type: "text", text }] };
    } catch (err) {
      return {
        content: [
          {
            type: "text",
            text: `Error searching flights: ${err instanceof Error ? err.message : String(err)}`,
          },
        ],
        isError: true,
      };
    }
  }
);

// Tool 2: explore_destinations
server.tool(
  "explore_destinations",
  "Discover the cheapest flight destinations from an airport (default: KRK Krakow). Great for travel inspiration - shows where you can fly cheapest within a date range and budget.",
  exploreSchema.shape,
  async (input) => {
    try {
      const text = await handleExplore(input, aggregator);
      return { content: [{ type: "text", text }] };
    } catch (err) {
      return {
        content: [
          {
            type: "text",
            text: `Error exploring destinations: ${err instanceof Error ? err.message : String(err)}`,
          },
        ],
        isError: true,
      };
    }
  }
);

// Tool 3: compare_prices
server.tool(
  "compare_prices",
  "Compare flight prices for the same route across all sources (Kiwi, Amadeus, Google Flights, Ryanair, Kiwi RapidAPI, FlightAPI). Useful for finding the best deal on a specific route and date.",
  compareSchema.shape,
  async (input) => {
    try {
      const text = await handleCompare(input, aggregator);
      return { content: [{ type: "text", text }] };
    } catch (err) {
      return {
        content: [
          {
            type: "text",
            text: `Error comparing prices: ${err instanceof Error ? err.message : String(err)}`,
          },
        ],
        isError: true,
      };
    }
  }
);

// Start server
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("Flights MCP server running on stdio");
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
