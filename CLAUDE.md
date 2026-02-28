# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

MCP (Model Context Protocol) server that aggregates multiple flight search APIs into a unified interface. Built with TypeScript, runs on Node.js.

## Commands

- **`npm start`** — Start the MCP server (`tsx src/index.ts`)
- **`npm run dev`** — Development mode with file watching (`tsx watch src/index.ts`)
- **`npm run build`** — Compile TypeScript (`tsc`, outputs to `dist/`)

No test framework is configured.

## Architecture

**Provider-Aggregator pattern** with three MCP tools exposed to clients:

1. `search_flights` — Search a specific route with price/date filters
2. `explore_destinations` — Discover cheap destinations from an origin
3. `compare_prices` — Compare the same route across all providers

### Key layers

- **`src/index.ts`** — MCP server entrypoint, registers tools with Zod schemas
- **`src/providers/`** — Six flight API providers (Kiwi, Amadeus, SerpAPI, Ryanair, Skyscanner, FlightAPI), all implementing `IFlightProvider` from `provider.ts`. Each normalizes API-specific responses into `NormalizedFlight`.
- **`src/services/aggregator.ts`** — Coordinates providers in parallel (`Promise.allSettled`), deduplicates by airline+flight_number+departure+route, sorts by price then duration
- **`src/services/cache.ts`** — TTL-based in-memory cache (5 min default)
- **`src/utils/rate-limiter.ts`** — Token bucket rate limiter, configured per provider
- **`src/utils/formatting.ts`** — Markdown table formatting for output

### Adding a new provider

Implement `IFlightProvider` from `src/providers/provider.ts` (methods: `searchFlights`, `exploreDestinations`, `isAvailable`), then register it in the aggregator.

## Conventions

- **Strict TypeScript** with ES2022 target and ESM modules
- **Zod** for all MCP tool input validation
- **Defaults**: origin KRK, currency PLN, 1 passenger, max 1 stop
- API keys loaded from `.env` via dotenv; configured in `.mcp.json`
- Amadeus uses OAuth2 with token caching; Ryanair uses unofficial API with conservative rate limits
